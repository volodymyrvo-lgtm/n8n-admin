import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmUsageController } from './llm-usage.controller.js';
import { LlmUsageService } from './llm-usage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LlmUsageController],
  providers: [LlmUsageService],
})
export class LlmUsageModule {}
