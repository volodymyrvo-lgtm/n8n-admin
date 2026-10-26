import type { ConfigService } from '@nestjs/config';

export interface CustomerApiConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Читає й валідує змінні Customer.io. Викликається в момент синхронізації, а
 * не при старті: якщо ключів немає (наприклад, локально), застосунок усе одно
 * запускається, а синхронізація дає зрозумілу помилку.
 */
export function readCustomerApiConfig(config: Pick<ConfigService, 'get'>): CustomerApiConfig {
  const read = (key: string): string => {
    const value = config.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable ${key}`);
    }
    return value;
  };

  const baseUrl = read('CASTOMER_BASE_API_ENDPOINT').replace(/\/+$/, '');
  // Шлях /folders додає сам клієнт; у змінній має бути лише база (…/v1/assets).
  if (baseUrl.endsWith('/folders')) {
    throw new Error('CASTOMER_BASE_API_ENDPOINT must not end with /folders (the client appends it)');
  }
  try {
    new URL(baseUrl);
  } catch {
    throw new Error('CASTOMER_BASE_API_ENDPOINT is not a valid URL');
  }

  return { baseUrl, apiKey: read('CASTOMER_APP_API_KEY') };
}
