import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readStorageConfig } from './storage.config.js';
import { SUPABASE_CLIENT } from './storage.constants.js';

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;

export interface UploadOptions {
  contentType: string;
  /** За замовчуванням false: існуючий файл не затирається (заміна — через новий шлях, див. buildPath). */
  upsert?: boolean;
}

function errorInfo(error: unknown): { message: string; status: string } {
  const e = error as { message?: unknown; status?: unknown; statusCode?: unknown };
  return {
    message: typeof e.message === 'string' ? e.message : 'Unknown storage error',
    status: String(e.statusCode ?? e.status ?? ''),
  };
}

/**
 * Обгортка над Supabase Storage для приватного бакета з банерами.
 * Шляхи генерує бекенд (buildPath) і зберігає в БД; клієнт сам шлях не задає.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
    config: ConfigService,
  ) {
    this.bucket = readStorageConfig(config).bucket;
  }

  /**
   * Унікальний шлях для кожного завантаження: `<bannerId>/<uuid>.<ext>`.
   * Заміна банера = завантажити новий файл за новим шляхом, оновити шлях у
   * БД і лише потім видалити старий. Так не буде застарілого кешу, а збій
   * посеред заміни не губить стару картинку.
   */
  buildPath(bannerId: string, extension = 'png'): string {
    if (!/^[A-Za-z0-9-]+$/.test(bannerId)) {
      throw new Error('Invalid bannerId for storage path');
    }
    if (!/^[a-z0-9]{1,5}$/.test(extension)) {
      throw new Error('Invalid file extension for storage path');
    }
    return `${bannerId}/${randomUUID()}.${extension}`;
  }

  async upload(path: string, body: Buffer, options: UploadOptions): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, body, {
      contentType: options.contentType,
      upsert: options.upsert ?? false,
    });

    if (error) {
      const { message, status } = errorInfo(error);
      if (status === '409' || /already exists|duplicate/i.test(message)) {
        throw new ConflictException(`File "${path}" already exists in storage`);
      }
      this.fail('upload', path, message);
    }
  }

  /** Тимчасове посилання для <img>; бакет приватний, тож інакше файл не відкрити. */
  async createSignedUrl(path: string, ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<string> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(path, ttlSeconds);

    if (error || !data) {
      this.failOrNotFound('createSignedUrl', path, error);
    }
    return data.signedUrl;
  }

  /**
   * Пакетна версія для списків: один запит до Supabase замість N. Файл, для
   * якого не вдалось підписати URL (наприклад, уже видалений), дає null — це
   * не повинно ламати весь список.
   */
  async createSignedUrls(paths: string[], ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (paths.length === 0) {
      return result;
    }

    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrls(paths, ttlSeconds);
    if (error || !data) {
      return this.fail('createSignedUrls', `${paths.length} files`, errorInfo(error).message);
    }

    for (const entry of data) {
      if (entry.path) {
        result.set(entry.path, entry.error ? null : entry.signedUrl);
      }
    }
    return result;
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);

    if (error || !data) {
      this.failOrNotFound('download', path, error);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  /** Ідемпотентно: якщо файлу вже немає — це не помилка (повторне прибирання безпечне). */
  async remove(path: string): Promise<void> {
    await this.removeMany([path]);
  }

  /** Те саме для пакета файлів одним запитом; відсутні файли ігноруються. */
  async removeMany(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const { error } = await this.client.storage.from(this.bucket).remove(paths);

    if (error) {
      const { message, status } = errorInfo(error);
      if (this.isNotFound(message, status)) {
        return;
      }
      this.fail('remove', paths.length === 1 ? paths[0]! : `${paths.length} files`, message);
    }
  }

  private isNotFound(message: string, status: string): boolean {
    return status === '404' || /not.?found/i.test(message);
  }

  private failOrNotFound(action: string, path: string, error: unknown): never {
    const { message, status } = errorInfo(error);
    if (this.isNotFound(message, status)) {
      throw new NotFoundException(`File "${path}" not found in storage`);
    }
    return this.fail(action, path, message);
  }

  private fail(action: string, path: string, message: string): never {
    // Повідомлення Supabase не містить ключа; у відповідь клієнту його не віддаємо.
    this.logger.error(`Storage ${action} failed for "${path}": ${message}`);
    throw new InternalServerErrorException(`Storage ${action} failed`);
  }
}
