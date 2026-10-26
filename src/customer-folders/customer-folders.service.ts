import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomerApiClient } from './customer-api.client.js';
import type { CreateCustomerFolderDto } from './dto/create-customer-folder.dto.js';
import type { CustomerFolderResponseDto, CustomerFoldersListResponseDto } from './dto/customer-folder-response.dto.js';
import type { FindCustomerFoldersQueryDto } from './dto/find-customer-folders-query.dto.js';

export interface SyncResult {
  /** Скільки папок прийшло з Customer.io. */
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Скільки папок видалено з БД, бо їх більше немає в Customer.io. */
  deleted: number;
}

@Injectable()
export class CustomerFoldersService {
  private readonly logger = new Logger(CustomerFoldersService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: CustomerApiClient,
  ) {}

  /**
   * Створює папку в Customer.io й одразу записує її в нашу БД, щоб вона з'явилась
   * у списку без очікування нічного синку. Запис — upsert за id: якщо синк
   * встиг раніше, дубля не буде. Якщо БД недоступна, папка в Customer.io вже є,
   * тому відповідаємо успіхом: наступний синк її підхопить.
   */
  async create(dto: CreateCustomerFolderDto): Promise<CustomerFolderResponseDto> {
    const folder = await this.client.createFolder(dto.name, dto.parentId ?? null);

    try {
      const data = {
        name: folder.name,
        parentExternalId: folder.parentFolderId,
        externalCreatedAt: folder.created,
        externalUpdatedAt: folder.updated,
      };
      await this.prisma.customerFolder.upsert({
        where: { externalId: folder.id },
        create: { externalId: folder.id, ...data },
        update: data,
      });
    } catch (error) {
      this.logger.error(`Folder ${folder.id} was created in Customer.io but not saved locally: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentFolderId,
      createdAt: folder.created,
      updatedAt: folder.updated,
    };
  }

  /** Усі папки з БД (без звернення до Customer.io) для фронта; плоский список, за назвою. */
  async findAll(query: FindCustomerFoldersQueryDto): Promise<CustomerFoldersListResponseDto> {
    const rows = await this.prisma.customerFolder.findMany({
      where: query.search ? { name: { contains: query.search, mode: 'insensitive' } } : undefined,
      orderBy: [{ name: 'asc' }, { externalId: 'asc' }],
    });

    const items = rows.map((row) => ({
      id: row.externalId,
      name: row.name,
      parentId: row.parentExternalId,
      createdAt: row.externalCreatedAt,
      updatedAt: row.externalUpdatedAt,
    }));
    return { items, total: items.length };
  }

  /**
   * Щоденний запуск о 03:00 за Баку. Помилку лише логуємо: необроблений
   * виняток у cron-обробнику не повинен валити процес.
   */
  @Cron('0 3 * * *', { name: 'customer-folders-sync', timeZone: 'Asia/Baku' })
  async syncDaily(): Promise<void> {
    try {
      const result = await this.sync();
      this.logger.log(
        `Customer folders synced: ${result.total} received, ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.deleted} deleted`,
      );
    } catch (error) {
      this.logger.error(`Daily customer folders sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Тягне папки з Customer.io й записує в БД без дублів: нові створює, змінені
   * (назва, батьківська папка, updated) оновлює, незмінені не чіпає, а папки,
   * яких більше немає в Customer.io, видаляє. Два запуски одночасно не виконуються.
   *
   * Запобіжник: якщо Customer.io повернув 0 папок, а в БД вони є, нічого не
   * видаляємо — майже напевно це збій API чи хибний ключ, а не «видалили все».
   */
  async sync(): Promise<SyncResult> {
    if (this.running) {
      throw new ConflictException('Customer folders sync is already running');
    }
    this.running = true;

    try {
      const remote = await this.client.listFolders();
      const existing = await this.prisma.customerFolder.findMany({
        select: { externalId: true, name: true, parentExternalId: true, externalUpdatedAt: true },
      });
      const byExternalId = new Map(existing.map((row) => [row.externalId, row]));

      const toCreate: Array<{
        externalId: number;
        name: string;
        parentExternalId: number | null;
        externalCreatedAt: Date;
        externalUpdatedAt: Date;
      }> = [];
      const toUpdate = [];
      let unchanged = 0;

      for (const folder of remote) {
        const row = byExternalId.get(folder.id);
        if (!row) {
          toCreate.push({
            externalId: folder.id,
            name: folder.name,
            parentExternalId: folder.parentFolderId,
            externalCreatedAt: folder.created,
            externalUpdatedAt: folder.updated,
          });
        } else if (
          row.name !== folder.name ||
          row.parentExternalId !== folder.parentFolderId ||
          row.externalUpdatedAt.getTime() !== folder.updated.getTime()
        ) {
          toUpdate.push(folder);
        } else {
          unchanged++;
        }
      }

      // skipDuplicates = ON CONFLICT DO NOTHING: навіть паралельний запис із
      // іншого екземпляра не створить дубля (унікальний індекс по external_id).
      const created =
        toCreate.length > 0 ? (await this.prisma.customerFolder.createMany({ data: toCreate, skipDuplicates: true })).count : 0;

      if (toUpdate.length > 0) {
        await this.prisma.$transaction(
          toUpdate.map((folder) =>
            this.prisma.customerFolder.update({
              where: { externalId: folder.id },
              data: { name: folder.name, parentExternalId: folder.parentFolderId, externalUpdatedAt: folder.updated },
            }),
          ),
        );
      }

      const remoteIds = new Set(remote.map((folder) => folder.id));
      const staleIds = existing.map((row) => row.externalId).filter((id) => !remoteIds.has(id));

      let deleted = 0;
      if (staleIds.length > 0) {
        if (remote.length === 0) {
          this.logger.warn(`Customer API returned no folders; skipping deletion of ${staleIds.length} local folders`);
        } else {
          deleted = (await this.prisma.customerFolder.deleteMany({ where: { externalId: { in: staleIds } } })).count;
        }
      }

      return { total: remote.length, created, updated: toUpdate.length, unchanged, deleted };
    } finally {
      this.running = false;
    }
  }
}
