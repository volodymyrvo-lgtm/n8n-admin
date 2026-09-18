import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
