import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { GlossariesModule } from './glossaries/glossaries.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PromptsModule } from './prompts/prompts.module.js';
import { RulesModule } from './rules/rules.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    RulesModule,
    JobsModule,
    PromptsModule,
    GlossariesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
