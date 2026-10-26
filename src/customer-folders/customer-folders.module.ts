import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerApiClient } from './customer-api.client.js';
import { CustomerFoldersController } from './customer-folders.controller.js';
import { CustomerFoldersService } from './customer-folders.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerFoldersController],
  providers: [CustomerApiClient, CustomerFoldersService],
  exports: [CustomerApiClient],
})
export class CustomerFoldersModule {}
