import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Стандартний ліміт JSON у Express — 100 КБ, а HTML листи (POST /updated-emails) бувають більшими.
  app.useBodyParser('json', { limit: '5mb' });

  const config = app.get(ConfigService);
  const corsOriginsRaw = config.get<string>('CORS_ORIGINS', 'http://localhost:4200').trim();

  // CORS_ORIGINS=* — тимчасово дозволяє будь-який origin (для розробки/дебагу).
  // origin:true, а не літеральний '*', бо з credentials:true браузер відхилить
  // буквальний wildcard — тут сервер відбиває назад Origin із запиту.
  const corsOrigin =
    corsOriginsRaw === '*'
      ? true
      : corsOriginsRaw
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger UI на /docs, JSON на /docs-json. SWAGGER_ENABLED=false вимикає (напр. на проді).
  if (config.get<string>('SWAGGER_ENABLED', 'true').trim().toLowerCase() !== 'false') {
    setupSwagger(app);
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
