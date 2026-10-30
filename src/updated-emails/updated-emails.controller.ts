import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateUpdatedEmailDto } from './dto/create-updated-email.dto.js';
import { FindUpdatedEmailsQueryDto } from './dto/find-updated-emails-query.dto.js';
import { PaginatedUpdatedEmailsResponseDto, UpdatedEmailResponseDto } from './dto/updated-email-response.dto.js';
import { UpdatedEmailsService } from './updated-emails.service.js';

@Controller('updated-emails')
export class UpdatedEmailsController {
  constructor(private readonly updatedEmailsService: UpdatedEmailsService) {}

  /**
   * n8n зберігає оновлений HTML листа (X-API-Key, без ролей).
   * Тіло: { "emailId": "...", "body": "<html>...</html>" }. Кожен виклик
   * створює новий запис, навіть для того самого emailId.
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUpdatedEmailDto): Promise<UpdatedEmailResponseDto> {
    return this.updatedEmailsService.create(dto);
  }

  /**
   * Список листів для фронта (JWT, будь-яка роль). Найновіші першими, без
   * body. Фільтри: ?emailId= (усі версії одного листа), ?search= (частина
   * emailId), ?page=, ?limit=.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: FindUpdatedEmailsQueryDto): Promise<PaginatedUpdatedEmailsResponseDto> {
    return this.updatedEmailsService.findAll(query);
  }

  /** Один лист разом із HTML (поле body). 404, якщо такого id немає. */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UpdatedEmailResponseDto> {
    return this.updatedEmailsService.findOne(id);
  }
}
