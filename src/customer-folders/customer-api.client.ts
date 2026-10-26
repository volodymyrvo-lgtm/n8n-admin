import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readCustomerApiConfig } from './customer-folders.config.js';

export interface RemoteFolder {
  id: number;
  name: string;
  parentFolderId: number | null;
  created: Date;
  updated: Date;
}

export interface RemoteAsset {
  id: number;
  name: string | null;
  /** Шлях/URL файлу в Customer.io, якщо API його віддав. */
  path: string | null;
  parentFolderId: number | null;
  size: number | null;
}

export interface UploadFileInput {
  /** Ім'я файлу в multipart (з розширенням). */
  filename: string;
  content: Buffer;
  contentType: string;
  /** Ім'я asset-а в Customer.io. */
  name: string;
  /** null — корінь. */
  parentFolderId: number | null;
}

export const PAGE_SIZE = 1000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_PAGES = 100;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Клієнт App API Customer.io. Лише читання папок. Ключ іде в заголовок
 * Authorization і не потрапляє ні в логи, ні в тексти помилок.
 */
@Injectable()
export class CustomerApiClient {
  private readonly logger = new Logger(CustomerApiClient.name);
  /** Базова пауза між повторами (мс), подвоюється з кожною спробою. У тестах ставлять 0. */
  retryDelayMs = 500;

  constructor(private readonly config: ConfigService) {}

  private readConfig() {
    try {
      return readCustomerApiConfig(this.config);
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Customer API is not configured');
    }
  }

  /**
   * Створює папку в Customer.io (POST /folders). Навмисно без повторів: операція
   * не ідемпотентна, а повтор після таймауту дав би 409 на вже створену папку.
   * parentFolderId = null — папка верхнього рівня.
   */
  async createFolder(name: string, parentFolderId: number | null): Promise<RemoteFolder> {
    const { baseUrl, apiKey } = this.readConfig();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/folders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_folder_id: parentFolderId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Customer API create folder failed: ${error instanceof Error ? error.name : 'error'}`);
      throw new BadGatewayException('Customer API is unreachable');
    }

    if (!response.ok) {
      this.logger.warn(`Customer API create folder responded ${response.status}`);
      switch (response.status) {
        case 400:
          throw new BadRequestException('Customer API rejected the folder (invalid name or parent)');
        case 404:
          throw new NotFoundException('Parent folder was not found in Customer API');
        case 409:
          throw new ConflictException('A folder with this name already exists in this parent folder');
        default:
          throw new BadGatewayException(`Customer API request failed (HTTP ${response.status})`);
      }
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BadGatewayException('Customer API returned invalid JSON');
    }
    const folder = typeof body === 'object' && body !== null ? (body as { folder?: unknown }).folder : undefined;
    return CustomerApiClient.parseFolder(folder);
  }

  /**
   * Завантажує один файл у Customer.io (POST /files, multipart/form-data:
   * file, name, parent_folder_id). Без повторів: операція не ідемпотентна,
   * повтор міг би створити дубль. Помилки мапляться на HTTP-винятки з коротким
   * текстом без ключа.
   */
  async uploadFile(input: UploadFileInput): Promise<RemoteAsset> {
    const { baseUrl, apiKey } = this.readConfig();

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.content)], { type: input.contentType }), input.filename);
    form.append('name', input.name);
    if (input.parentFolderId !== null) {
      form.append('parent_folder_id', String(input.parentFolderId));
    }

    let response: Response;
    try {
      // Content-Type не ставимо вручну: fetch сам додасть multipart boundary.
      response = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Customer API upload failed: ${error instanceof Error ? error.name : 'error'}`);
      throw new BadGatewayException('Customer API is unreachable');
    }

    if (!response.ok) {
      this.logger.warn(`Customer API upload responded ${response.status}`);
      switch (response.status) {
        case 400:
        case 413:
          throw new BadRequestException('Customer API rejected the file (invalid name, type or size over 2 MB)');
        case 404:
          throw new NotFoundException('Parent folder was not found in Customer API');
        case 409:
          throw new ConflictException('A file with this name already exists in this folder');
        default:
          throw new BadGatewayException(`Customer API request failed (HTTP ${response.status})`);
      }
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BadGatewayException('Customer API returned invalid JSON');
    }
    const asset = (typeof body === 'object' && body !== null ? (body as { asset?: unknown }).asset : undefined) as Record<string, unknown> | undefined;
    if (typeof asset !== 'object' || asset === null || !Number.isInteger(asset['id'])) {
      throw new BadGatewayException('Customer API returned an unexpected response');
    }
    return {
      id: asset['id'] as number,
      name: typeof asset['name'] === 'string' ? asset['name'] : null,
      path: typeof asset['path'] === 'string' ? asset['path'] : null,
      parentFolderId: Number.isInteger(asset['parent_folder_id']) ? (asset['parent_folder_id'] as number) : null,
      size: typeof asset['size'] === 'number' ? asset['size'] : null,
    };
  }

  /** Усі папки: проходить усі сторінки й прибирає повтори за id. */
  async listFolders(): Promise<RemoteFolder[]> {
    const { baseUrl, apiKey } = this.readConfig();

    const byId = new Map<number, RemoteFolder>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.request(`${baseUrl}/folders?page=${page}&limit=${PAGE_SIZE}`, apiKey);
      const { folders, total } = CustomerApiClient.parse(body);
      for (const folder of folders) {
        byId.set(folder.id, folder);
      }

      if (folders.length < PAGE_SIZE || (total !== undefined && byId.size >= total)) {
        break;
      }
    }

    return [...byId.values()];
  }

  private async request(url: string, apiKey: string): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        this.logger.warn(`Customer API request failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${error instanceof Error ? error.name : 'error'}`);
        if (attempt >= MAX_ATTEMPTS) {
          throw new BadGatewayException('Customer API is unreachable');
        }
        await this.backoff(attempt);
        continue;
      }

      if (response.ok) {
        try {
          return (await response.json()) as unknown;
        } catch {
          throw new BadGatewayException('Customer API returned invalid JSON');
        }
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        this.logger.warn(`Customer API responded ${response.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying`);
        await this.backoff(attempt);
        continue;
      }

      throw new BadGatewayException(`Customer API request failed (HTTP ${response.status})`);
    }
  }

  private backoff(attempt: number): Promise<void> {
    const delay = this.retryDelayMs * 2 ** (attempt - 1);
    return delay > 0 ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
  }

  /** Перевіряє одну папку; created/updated (unix-секунди) перетворює на Date. */
  private static parseFolder(raw: unknown): RemoteFolder {
    const unexpected = () => new BadGatewayException('Customer API returned an unexpected response');
    const f = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const parent = f['parent_folder_id'];
    if (
      !Number.isInteger(f['id']) ||
      typeof f['name'] !== 'string' ||
      !(parent === null || parent === undefined || Number.isInteger(parent)) ||
      !isTimestamp(f['created']) ||
      !isTimestamp(f['updated'])
    ) {
      throw unexpected();
    }

    return {
      id: f['id'] as number,
      name: f['name'],
      parentFolderId: (parent as number | null | undefined) ?? null,
      created: new Date(f['created'] * 1000),
      updated: new Date(f['updated'] * 1000),
    };
  }

  /** Перевіряє форму відповіді; created/updated (unix-секунди) перетворює на Date. */
  private static parse(body: unknown): { folders: RemoteFolder[]; total: number | undefined } {
    const unexpected = () => new BadGatewayException('Customer API returned an unexpected response');

    if (typeof body !== 'object' || body === null) {
      throw unexpected();
    }
    const { folders, meta } = body as { folders?: unknown; meta?: { pagination?: { total?: unknown } } };
    if (!Array.isArray(folders)) {
      throw unexpected();
    }

    const parsed = folders.map((raw: unknown) => CustomerApiClient.parseFolder(raw));

    const total = meta?.pagination?.total;
    return { folders: parsed, total: typeof total === 'number' ? total : undefined };
  }
}
