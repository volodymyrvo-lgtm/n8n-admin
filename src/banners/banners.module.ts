import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerFoldersModule } from '../customer-folders/customer-folders.module.js';
import { BannersController } from './banners.controller.js';
import { BannersSendService } from './banners-send.service.js';
import { BannersService } from './banners.service.js';

@Module({
  imports: [AuthModule, CustomerFoldersModule],
  controllers: [BannersController],
  providers: [BannersService, BannersSendService],
})
export class BannersModule {}
