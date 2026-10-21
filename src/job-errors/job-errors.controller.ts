import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../generated/prisma/client.js';
import { CreateJobErrorDto } from './dto/create-job-error.dto.js';
import { FindJobErrorsQueryDto } from './dto/find-job-errors-query.dto.js';
import { JobErrorResponseDto, PaginatedJobErrorsResponseDto } from './dto/job-error-response.dto.js';
import { JobErrorsService } from './job-errors.service.js';

@Controller('job-errors')
export class JobErrorsController {
  constructor(private readonly jobErrorsService: JobErrorsService) {}

  /**
   * Зберігає помилку виконання джоби — викликає n8n за окремим API-ключем
   * (не JWT). Тіло: { "jobId": "<uuid>", "error": <довільний JSON> }.
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateJobErrorDto): Promise<JobErrorResponseDto> {
    return this.jobErrorsService.create(dto);
  }

  /**
   * Помилки з пагінацією; ?jobId= лишає лише помилки конкретної джоби. Для
   * фронта, за JWT. Бачать admin, user та analyst; reader — ні.
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.user, Role.analyst)
  findAll(@Query() query: FindJobErrorsQueryDto): Promise<PaginatedJobErrorsResponseDto> {
    return this.jobErrorsService.findAll(query);
  }
}
