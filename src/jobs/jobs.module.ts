import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JobsCleanupService } from './jobs-cleanup.service.js';
import { JobsController } from './jobs.controller.js';
import { JobsGateway } from './jobs.gateway.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [JobsService, JobsGateway, JobsCleanupService],
  exports: [JobsService],
})
export class JobsModule {}
