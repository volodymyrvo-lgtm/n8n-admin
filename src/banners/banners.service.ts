import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BannerStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { BannerListItemDto, BannerResponseDto, DeleteBannersResponseDto, PaginatedBannersResponseDto } from './dto/banner-response.dto.js';
import { CreateBannerDto } from './dto/create-banner.dto.js';
import { FindBannersQueryDto } from './dto/find-banners-query.dto.js';
import type { ReplaceBannerDto } from './dto/replace-banner.dto.js';
import { uuidv7 } from './uuid7.js';

export const MAX_BANNER_BYTES = 10 * 1024 * 1024;

/** Файл, який віддає multer (memoryStorage). Свій тип, щоб не тягнути @types/multer. */
export interface UploadedBannerFile {
  buffer: Buffer;
  size: number;
}

/** Скільки банерів (а отже і файлів) видаляється за один прохід removeAll. */
export const REMOVE_BATCH_SIZE = 100;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Приймає PNG від n8n: перевіряє файл за сигнатурою (а не за mimetype, який
   * клієнт може вказати як завгодно), кладе у Storage й створює запис
   * pending. Якщо запис у БД не вдався — файл прибирається, щоб не лишати
   * сиріт у бакеті.
   */
  async create(dto: CreateBannerDto, file: UploadedBannerFile | undefined): Promise<BannerResponseDto> {
    const validFile = BannersService.assertValidPng(file);

    // Перевірка ДО завантаження, щоб неіснуюча джоба не залишила файл у Storage.
    if (dto.jobId) {
      const job = await this.prisma.job.findUnique({ where: { id: dto.jobId }, select: { id: true } });
      if (!job) {
        throw new BadRequestException(`Job "${dto.jobId}" not found`);
      }
    }

    const id = uuidv7();
    const storagePath = this.storage.buildPath(id, 'png');
    await this.storage.upload(storagePath, validFile.buffer, { contentType: 'image/png' });

    try {
      const banner = await this.prisma.banner.create({
        data: {
          id,
          jobId: dto.jobId,
          figmaImageName: dto.figmaImageName,
          storagePath,
          mimeType: 'image/png',
          sizeBytes: validFile.buffer.length,
        },
      });
      return BannersService.toResponseDto(banner);
    } catch (error) {
      await this.storage.remove(storagePath).catch((cleanupError: unknown) => {
        this.logger.error(`Failed to remove orphan file "${storagePath}": ${String(cleanupError)}`);
      });
      throw error;
    }
  }

  /**
   * Заміна картинки банера вручну (фронт завантажує новий PNG замість
   * невдалого). Новий файл кладеться за новим шляхом, рядок у БД оновлюється
   * (шлях, розмір, за потреби назва), статус скидається в pending, і лише
   * після цього старий файл видаляється зі Storage. Якщо оновлення БД
   * не вдалось, новий файл прибирається, а банер лишається з попереднім.
   * Банер у статусі sending (іде відправка) або sent замінити не можна: 409.
   */
  async replaceImage(id: string, dto: ReplaceBannerDto, file: UploadedBannerFile | undefined): Promise<BannerListItemDto> {
    const validFile = BannersService.assertValidPng(file);

    const current = await this.prisma.banner.findUnique({ where: { id }, select: { storagePath: true, status: true } });
    if (!current) {
      throw new NotFoundException(`Banner "${id}" not found`);
    }
    if (BannersService.isLocked(current.status)) {
      throw new ConflictException(`Banner is ${current.status} and cannot be replaced`);
    }

    const newPath = this.storage.buildPath(id, 'png');
    await this.storage.upload(newPath, validFile.buffer, { contentType: 'image/png' });

    let updated: Awaited<ReturnType<typeof this.prisma.banner.findUnique>>;
    try {
      // updateMany з умовою на статус: якщо відправка почалась після перевірки вище, нічого не оновиться.
      const { count } = await this.prisma.banner.updateMany({
        where: { id, status: { notIn: [BannerStatus.sending, BannerStatus.sent] } },
        data: {
          storagePath: newPath,
          mimeType: 'image/png',
          sizeBytes: validFile.buffer.length,
          status: BannerStatus.pending,
          ...(dto.figmaImageName ? { figmaImageName: dto.figmaImageName } : {}),
        },
      });
      if (count === 0) {
        throw new ConflictException('Banner is being sent or was removed and cannot be replaced');
      }
      updated = await this.prisma.banner.findUnique({ where: { id } });
    } catch (error) {
      await this.storage.remove(newPath).catch((cleanupError: unknown) => {
        this.logger.error(`Failed to remove orphan file "${newPath}": ${String(cleanupError)}`);
      });
      throw error;
    }
    if (!updated) {
      throw new NotFoundException(`Banner "${id}" not found`);
    }

    // Старий файл більше нікому не потрібен; збій прибирання не ламає заміну.
    await this.storage.remove(current.storagePath).catch((cleanupError: unknown) => {
      this.logger.error(`Banner ${id} was replaced but the old file "${current.storagePath}" was not removed: ${String(cleanupError)}`);
    });

    const imageUrl = await this.storage.createSignedUrl(newPath).catch((signError: unknown) => {
      this.logger.error(`Failed to sign banner URL: ${String(signError)}`);
      return null;
    });
    return { ...BannersService.toResponseDto(updated), imageUrl };
  }

  /** Банер, який зараз відправляється або вже відправлений, не міняємо. */
  private static isLocked(status: BannerStatus): boolean {
    return status === BannerStatus.sending || status === BannerStatus.sent;
  }

  /** Перевірка файлу за розміром і сигнатурою (а не за mimetype, який клієнт може вказати як завгодно). */
  private static assertValidPng(file: UploadedBannerFile | undefined): UploadedBannerFile {
    if (!file || file.size === 0) {
      throw new BadRequestException('File is required (multipart field "file")');
    }
    if (file.buffer.length > MAX_BANNER_BYTES) {
      throw new BadRequestException(`File is too large (max ${MAX_BANNER_BYTES / 1024 / 1024} MB)`);
    }
    if (!file.buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new BadRequestException('Only PNG images are accepted');
    }
    return file;
  }

  /**
   * Список із пагінацією, найновіші першими. Байтів картинок тут немає: у БД
   * лише метадані, а для показу кожен елемент отримує тимчасовий imageUrl
   * (один пакетний запит до Storage на всю сторінку). Якщо Storage недоступний,
   * список усе одно віддається, лише з imageUrl: null.
   */
  async findAll(query: FindBannersQueryDto): Promise<PaginatedBannersResponseDto> {
    const where: Prisma.BannerWhereInput = {
      status: query.status && query.status.length > 0 ? { in: query.status } : undefined,
      jobId: query.jobId,
      figmaImageName: query.search ? { contains: query.search, mode: 'insensitive' } : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.banner.count({ where }),
    ]);

    let urls = new Map<string, string | null>();
    try {
      // Файли sent-банерів уже видалені зі Storage, тож їх не підписуємо.
      urls = await this.storage.createSignedUrls(rows.filter((row) => row.status !== 'sent').map((row) => row.storagePath));
    } catch (error) {
      this.logger.error(`Failed to sign banner URLs: ${String(error)}`);
    }

    const items: BannerListItemDto[] = rows.map((row) => ({
      ...BannersService.toResponseDto(row),
      imageUrl: urls.get(row.storagePath) ?? null,
    }));

    return { items, total, page: query.page, limit: query.limit };
  }

  /**
   * Видаляє банер і його файл. Спершу файл, потім рядок: якщо впаде другий
   * крок, лишається рядок без файлу (його можна видалити повторно, remove
   * ідемпотентний). У зворотному порядку файл став би сиротою, якого вже
   * ніхто не знайде.
   */
  async remove(id: string): Promise<void> {
    const banner = await this.prisma.banner.findUnique({ where: { id }, select: { storagePath: true } });
    if (!banner) {
      throw new NotFoundException(`Banner "${id}" not found`);
    }

    await this.storage.remove(banner.storagePath);
    // deleteMany, а не delete: паралельне видалення цього ж банера не дає помилки P2025.
    await this.prisma.banner.deleteMany({ where: { id } });
  }

  /**
   * Видаляє всі банери разом із файлами пакетами по REMOVE_BATCH_SIZE (файл
   * → рядок у кожному пакеті). Якщо впаде посеред, вже видалені пакети
   * лишаються видаленими, а повторний виклик дочистить решту.
   */
  async removeAll(): Promise<{ deletedCount: number }> {
    let deletedCount = 0;

    for (;;) {
      const batch = await this.prisma.banner.findMany({
        select: { id: true, storagePath: true },
        orderBy: { id: 'asc' },
        take: REMOVE_BATCH_SIZE,
      });
      if (batch.length === 0) {
        return { deletedCount };
      }

      await this.storage.removeMany(batch.map((row) => row.storagePath));
      const { count } = await this.prisma.banner.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
      deletedCount += count;
    }
  }

  /**
   * Видаляє лише вказані банери разом із файлами; решту не чіпає. Порядок як
   * у remove/removeAll: пакет файлів → його рядки. Неіснуючі id не є
   * помилкою (операція ідемпотентна): вони повертаються в notFoundIds.
   */
  async removeMany(ids: string[]): Promise<DeleteBannersResponseDto> {
    const unique = [...new Set(ids)];
    const rows = await this.prisma.banner.findMany({
      where: { id: { in: unique } },
      select: { id: true, storagePath: true },
    });

    let deletedCount = 0;
    for (let i = 0; i < rows.length; i += REMOVE_BATCH_SIZE) {
      const batch = rows.slice(i, i + REMOVE_BATCH_SIZE);
      await this.storage.removeMany(batch.map((row) => row.storagePath));
      const { count } = await this.prisma.banner.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
      deletedCount += count;
    }

    const found = new Set(rows.map((row) => row.id));
    return { deletedCount, notFoundIds: unique.filter((id) => !found.has(id)) };
  }

  private static toResponseDto(banner: {
    id: string;
    jobId: string | null;
    figmaImageName: string;
    mimeType: string;
    sizeBytes: number;
    status: BannerResponseDto['status'];
    createdAt: Date;
  }): BannerResponseDto {
    return {
      id: banner.id,
      jobId: banner.jobId,
      figmaImageName: banner.figmaImageName,
      mimeType: banner.mimeType,
      sizeBytes: banner.sizeBytes,
      status: banner.status,
      createdAt: banner.createdAt,
    };
  }
}
