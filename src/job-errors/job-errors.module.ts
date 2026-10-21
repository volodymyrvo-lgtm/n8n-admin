import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JobErrorsController } from './job-errors.controller.js';
import { JobErrorsService } from './job-errors.service.js';

@Module({
  imports: [AuthModule],
  controllers: [JobErrorsController],
  providers: [JobErrorsService],
})
export class JobErrorsModule {}
