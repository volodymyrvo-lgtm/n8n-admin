import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
