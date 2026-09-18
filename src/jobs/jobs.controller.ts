import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.type.js';
import { Role } from '../generated/prisma/client.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobResponseDto } from './dto/job-response.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(): Promise<JobResponseDto[]> {
    return this.jobsService.findAll();
  }

  /**
   * Створити джобу може будь-який залогінений юзер, включно з role: user —
   * це єдиний виняток серед "створення/видалення/редагування", решта таких
   * операцій (users/rules/prompts) обмежені RolesGuard'ом до admin.
   * Джоба одразу пов'язується зі створювачем через runnedBy.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateJobDto, @CurrentUser() user: JwtPayload): Promise<JobResponseDto> {
    return this.jobsService.create(dto, user.sub);
  }

  /** Оновлює прогрес виконання джоби — викликає n8n за окремим API-ключем (не JWT). */
  @Patch(':id')
  @UseGuards(ApiKeyGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto): Promise<JobResponseDto> {
    return this.jobsService.update(id, dto);
  }

  /**
   * Видаляє геть усі джоби одним запитом. Деструктивна масова операція —
   * тільки для admin (як і решта create/update/delete, крім POST /jobs).
   */
  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  removeAll(): Promise<{ deletedCount: number }> {
    return this.jobsService.removeAll();
  }
}
