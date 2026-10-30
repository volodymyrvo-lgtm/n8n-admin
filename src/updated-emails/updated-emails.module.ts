import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UpdatedEmailsController } from './updated-emails.controller.js';
import { UpdatedEmailsService } from './updated-emails.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UpdatedEmailsController],
  providers: [UpdatedEmailsService],
})
export class UpdatedEmailsModule {}
