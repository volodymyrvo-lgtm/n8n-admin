import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');

    // Supabase (і пряме з'єднання, і Session/Transaction pooler) віддає
    // сертифікат, якого немає у стандартному наборі довірених CA в Node —
    // з дефолтною повною перевіркою (sslmode=require зараз означає
    // verify-full) це падає з "self-signed certificate in certificate
    // chain". Підсовуємо кореневий сертифікат Supabase явно, замість того
    // щоб вимикати перевірку через rejectUnauthorized: false.
    const caCertPath = resolve(process.cwd(), config.get<string>('DATABASE_CA_CERT_PATH', 'supabase-ca.crt'));
    const ssl = PrismaService.resolveSslConfig(caCertPath, config);

    super({ adapter: new PrismaPg({ connectionString, ssl }) });
  }

  /**
   * Пріоритет: якщо лежить кореневий сертифікат Supabase — перевіряємо
   * TLS повністю (найбезпечніший варіант). Якщо його ще нема, але явно
   * дозволили DATABASE_SSL_REJECT_UNAUTHORIZED=false — з'єднуємось без
   * перевірки ланцюжка сертифікатів (трафік лишається зашифрованим, але
   * без захисту від MITM). Це навмисно НЕ дефолт — треба явно увімкнути
   * в .env, і саме тому, коли з'явиться сертифікат, він автоматично
   * переб'є цей обхід.
   */
  // Статичний — потрібен ДО виклику super(), а до super() у похідному
  // класі "this" ще недоступний (instance-поля на кшталт логера теж
  // ініціалізуються лише після super()).
  private static resolveSslConfig(
    caCertPath: string,
    config: ConfigService,
  ): { ca: string; rejectUnauthorized: true } | { rejectUnauthorized: false } | undefined {
    if (existsSync(caCertPath)) {
      return { ca: readFileSync(caCertPath, 'utf8'), rejectUnauthorized: true };
    }

    const allowInsecure = config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'true') === 'false';
    if (allowInsecure) {
      new Logger(PrismaService.name).warn(
        'DATABASE_SSL_REJECT_UNAUTHORIZED=false: з\'єднання з БД без перевірки сертифіката. ' +
          'Тимчасовий обхід — додай supabase-ca.crt і прибери цей прапорець.',
      );
      return { rejectUnauthorized: false };
    }

    return undefined;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
