import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { readStorageConfig } from './storage.config.js';
import { SUPABASE_CLIENT } from './storage.constants.js';
import { StorageService } from './storage.service.js';

/**
 * Глобальний (як PrismaModule): сервіс банерів просто інжектить
 * StorageService. Клієнт створюється з service-role/secret ключем, тому
 * живе тільки на бекенді; сесії й автооновлення токена йому не потрібні.
 */
@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { url, serviceKey } = readStorageConfig(config);
        return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
