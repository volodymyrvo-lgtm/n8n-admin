import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { BannerStatus } from '../generated/prisma/client.js';
import { CustomerApiClient, type RemoteAsset } from '../customer-folders/customer-api.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { SendBannerResultDto, SendBannersResponseDto } from './dto/banner-response.dto.js';
import type { SendBannersDto } from './dto/send-banners.dto.js';

/** Ліміт Customer.io на файл. Більші банери не відправляємо, а одразу позначаємо send_failed. */
export const CUSTOMER_MAX_FILE_BYTES = 2 * 1024 * 1024;
/**
 * Скільки часу запит може починати нові відправки. Проксі (Render) обриває
 * відповіді після ~100 с, тому після бюджету зупиняємось і повертаємо
 * remaining: фронт повторює виклик, доки remaining > 0.
 */
export const SEND_TIME_BUDGET_MS = 60_000;

const EXTENSION_BY_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif' };

/**
 * Ім'я файлу для multipart. Customer.io визначає тип за розширенням, а
 * figmaImageName часто без нього («124_en»): тоді файл потрапляв як PDF. Тож
 * дописуємо розширення за mimeType, якщо його ще немає. Те саме ім'я йде й у
 * поле name; у customer_assets, як і раніше, пишемо чистий figmaImageName.
 */
export function uploadFilename(figmaImageName: string, mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType] ?? '.png';
  const alreadyHas = figmaImageName.toLowerCase().endsWith(extension) || (extension === '.jpg' && figmaImageName.toLowerCase().endsWith('.jpeg'));
  return alreadyHas ? figmaImageName : `${figmaImageName}${extension}`;
}

@Injectable()
export class BannersSendService {
  private readonly logger = new Logger(BannersSendService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly customerApi: CustomerApiClient,
  ) {}

  /**
   * Відправляє банери в Customer.io по одному. Для кожного: статус sending →
   * завантаження → запис у customer_assets → видалення файлу зі Storage і
   * рядка з banners. Збій одного банера (send_failed) не зупиняє решту; якщо
   * банер не вдалось прибрати після відправки, він лишається зі статусом sent
   * і повторно не відправляється. Два запуски одночасно не
   * виконуються (409).
   */
  async send(dto: SendBannersDto): Promise<SendBannersResponseDto> {
    if (this.running) {
      throw new ConflictException('Banners are already being sent');
    }
    this.running = true;

    try {
      const rows = await this.prisma.banner.findMany({
        where: { status: { not: BannerStatus.sent }, ...(dto.ids ? { id: { in: dto.ids } } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, figmaImageName: true, storagePath: true, mimeType: true, sizeBytes: true },
      });

      const deadline = Date.now() + SEND_TIME_BUDGET_MS;
      const results: SendBannerResultDto[] = [];
      for (const row of rows) {
        if (Date.now() > deadline) {
          break;
        }
        results.push(await this.sendOne(row, dto.parentId ?? null));
      }

      const found = new Set(rows.map((row) => row.id));
      return {
        total: rows.length,
        sent: results.filter((r) => r.status === 'sent').length,
        failed: results.filter((r) => r.status === 'send_failed').length,
        remaining: rows.length - results.length,
        skippedIds: (dto.ids ?? []).filter((id) => !found.has(id)),
        results,
      };
    } finally {
      this.running = false;
    }
  }

  private async sendOne(
    row: { id: string; figmaImageName: string; storagePath: string; mimeType: string; sizeBytes: number },
    parentFolderId: number | null,
  ): Promise<SendBannerResultDto> {
    const base = { id: row.id, figmaImageName: row.figmaImageName };

    if (row.sizeBytes > CUSTOMER_MAX_FILE_BYTES) {
      await this.setStatus(row.id, BannerStatus.send_failed);
      return { ...base, status: 'send_failed', error: `File is larger than ${CUSTOMER_MAX_FILE_BYTES / 1024 / 1024} MB (Customer.io limit)` };
    }

    let asset: RemoteAsset;
    try {
      await this.prisma.banner.update({ where: { id: row.id }, data: { status: BannerStatus.sending } });
      const content = await this.storage.download(row.storagePath);
      // name (ім'я asset-а) і ім'я файлу однакові й з розширенням: Customer.io бере
      // name за основу, і без розширення файл показується як PDF.
      const filename = uploadFilename(row.figmaImageName, row.mimeType);
      asset = await this.customerApi.uploadFile({
        filename,
        content,
        contentType: row.mimeType,
        name: filename,
        parentFolderId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Banner ${row.id} was not sent: ${message}`);
      await this.setStatus(row.id, BannerStatus.send_failed);
      return { ...base, status: 'send_failed', error: message };
    }

    // Файл уже в Customer.io: далі лише прибирання, і його збої не повинні
    // перетворювати успіх на помилку (повтор дав би дубль).
    this.logger.log(`Banner ${row.id} uploaded to Customer.io: asset ${asset.id}, name=${asset.name ?? '-'}, path=${asset.path ?? '-'}, size=${asset.size ?? '-'}`);
    const result: SendBannerResultDto = { ...base, status: 'sent', customerAssetId: asset.id, customerName: asset.name, customerPath: asset.path };
    // Запис про завантажений файл (emailId = figmaImageName, path). Збій не
    // перетворює успішну відправку на помилку, але лишає warning і запис у лозі.
    try {
      const data = {
        emailId: row.figmaImageName,
        path: asset.path,
        name: asset.name,
        parentFolderId: asset.parentFolderId,
        sizeBytes: asset.size,
      };
      await this.prisma.customerAsset.upsert({ where: { externalId: asset.id }, create: { externalId: asset.id, ...data }, update: data });
    } catch (error) {
      this.logger.error(`Banner ${row.id} was uploaded (asset ${asset.id}) but the asset record was not saved: ${error instanceof Error ? error.message : String(error)}`);
      result.warning = 'Uploaded to Customer.io, but the asset record could not be saved';
    }

    // Файл уже в Customer.io, тож банер більше не потрібен: прибираємо файл і
    // рядок (файл першим, як і в remove). Якщо прибирання не вдалось, позначаємо
    // банер sent, щоб повторний запуск не відправив його вдруге.
    try {
      await this.storage.remove(row.storagePath);
      await this.prisma.banner.deleteMany({ where: { id: row.id } });
    } catch (error) {
      this.logger.error(`Banner ${row.id} was sent (asset ${asset.id}) but could not be removed: ${error instanceof Error ? error.message : String(error)}`);
      result.warning = 'Uploaded to Customer.io, but the banner could not be removed; it is marked sent';
      await this.setStatus(row.id, BannerStatus.sent);
    }
    return result;
  }

  /** Зміна статусу після збою не повинна ховати первинну причину помилки. */
  private async setStatus(id: string, status: BannerStatus): Promise<void> {
    try {
      await this.prisma.banner.update({ where: { id }, data: { status } });
    } catch (error) {
      this.logger.error(`Could not set banner ${id} to ${status}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
