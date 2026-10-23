import type { ConfigService } from '@nestjs/config';

export interface StorageConfig {
  url: string;
  serviceKey: string;
  bucket: string;
}

/**
 * Читає й валідує змінні Supabase Storage. Порожнє значення (`KEY=`) —
 * така сама помилка, як і відсутнє: ConfigService.getOrThrow кидає лише на
 * undefined, а порожній рядок пройшов би і впав аж на першому завантаженні.
 */
export function readStorageConfig(config: Pick<ConfigService, 'get'>): StorageConfig {
  const read = (key: string): string => {
    const value = config.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable ${key}`);
    }
    return value;
  };

  const url = read('SUPABASE_URL').replace(/\/+$/, '');
  // Типова помилка: скопіювати адресу REST API (…/rest/v1/). SDK сам
  // додає /storage/v1, тож потрібен лише корінь проєкту.
  if (/\/(rest|storage)\/v1$/.test(url)) {
    throw new Error('SUPABASE_URL must be the project root (https://<ref>.supabase.co) without /rest/v1 or /storage/v1');
  }
  try {
    new URL(url);
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL');
  }

  return { url, serviceKey: read('SUPABASE_SERVICE_KEY'), bucket: read('SUPABASE_BANNERS_BUCKET') };
}
