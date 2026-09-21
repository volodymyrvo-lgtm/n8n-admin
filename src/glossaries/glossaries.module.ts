import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GlossariesController } from './glossaries.controller.js';
import { GlossariesService } from './glossaries.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GlossariesController],
  providers: [GlossariesService],
  exports: [GlossariesService],
})
export class GlossariesModule {}
