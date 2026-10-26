// Разова синхронізація папок Customer.io з базою (те саме, що робить нічний cron):
//   npm run folders:sync
// Збирає проєкт, піднімає Nest без HTTP-сервера, викликає
// CustomerFoldersService.sync() і друкує підсумок. Потрібні DATABASE_URL та
// CASTOMER_* у .env.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { CustomerFoldersService } from '../dist/customer-folders/customer-folders.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  const result = await app.get(CustomerFoldersService).sync();
  console.log('✓ Синхронізація завершена:', result);
} catch (error) {
  console.error('✗ Синхронізація не вдалась:', error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
