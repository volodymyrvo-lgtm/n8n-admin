import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../generated/prisma/client.js';
import { BannersService, MAX_BANNER_BYTES, type UploadedBannerFile } from './banners.service.js';
import { BannerResponseDto, PaginatedBannersResponseDto } from './dto/banner-response.dto.js';
import { CreateBannerDto } from './dto/create-banner.dto.js';
import { FindBannersQueryDto } from './dto/find-banners-query.dto.js';

@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  /**
   * n8n завантажує PNG банера. multipart/form-data: поле "file" (PNG, до
   * 10 МБ), текстові figmaImageName і необов'язковий jobId. Авторизація —
   * X-API-Key, як і в решти машинних маршрутів (без ролей).
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BANNER_BYTES, files: 1 } }))
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBannerDto, @UploadedFile() file: UploadedBannerFile | undefined): Promise<BannerResponseDto> {
    return this.bannersService.create(dto, file);
  }

  /**
   * Список банерів для фронта (JWT). Доступний будь-якій ролі, як і GET /jobs.
   * Фільтри: ?status=pending,rejected, ?jobId=, ?search=, ?page=, ?limit=.
   * Кожен елемент містить imageUrl — тимчасове посилання на картинку.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: FindBannersQueryDto): Promise<PaginatedBannersResponseDto> {
    return this.bannersService.findAll(query);
  }

  /** Видаляє один банер разом із файлом у Storage. Лише admin (як і решта видалень). 404, якщо банера немає. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bannersService.remove(id);
  }

  /** Видаляє всі банери разом із файлами. Деструктивна масова операція — лише admin. */
  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  removeAll(): Promise<{ deletedCount: number }> {
    return this.bannersService.removeAll();
  }
}
