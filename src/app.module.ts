import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BannersModule } from './banners/banners.module.js';
import { CustomerFoldersModule } from './customer-folders/customer-folders.module.js';
import { GlossariesModule } from './glossaries/glossaries.module.js';
import { JobErrorsModule } from './job-errors/job-errors.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LlmUsageModule } from './llm-usage/llm-usage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PromptsModule } from './prompts/prompts.module.js';
import { RulesModule } from './rules/rules.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UpdatedEmailsModule } from './updated-emails/updated-emails.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    UsersModule,
    AuthModule,
    RulesModule,
    JobsModule,
    JobErrorsModule,
    BannersModule,
    CustomerFoldersModule,
    UpdatedEmailsModule,
    PromptsModule,
    GlossariesModule,
    LlmUsageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
