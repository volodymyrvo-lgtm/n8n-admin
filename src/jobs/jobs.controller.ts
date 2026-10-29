import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { DeletedCountResponseDto } from '../common/dto/deleted-count-response.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.type.js';
import { Role } from '../generated/prisma/client.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { CreateDesignJobDto } from './dto/create-design-job.dto.js';
import { CreateSeoJobDto } from './dto/create-seo-job.dto.js';
import { FindJobsQueryDto } from './dto/find-jobs-query.dto.js';
import { JobResponseDto } from './dto/job-response.dto.js';
import { PaginatedJobsResponseDto } from './dto/paginated-jobs-response.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: FindJobsQueryDto): Promise<PaginatedJobsResponseDto> {
    return this.jobsService.findAll(query);
  }

  /** Повертає одну джобу з правилами за id; 404, якщо такої немає. Доступно будь-якій авторизованій ролі (як і GET /jobs). */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<JobResponseDto> {
    return this.jobsService.findOne(id);
  }

  /**
   * Створити джобу можуть admin і user — це єдиний виняток серед
   * "створення/видалення/редагування", решта таких операцій (users/rules/
   * prompts) обмежені RolesGuard'ом до admin. reader і analyst лише читають.
   * Джоба одразу пов'язується зі створювачем через runnedBy.
   *
   * Для taskStatus welcome_email_html_update / system_email_html_update
   * потрібні лише taskStatus, taskDescription і необов'язковий isBannerUpdate;
   * решта полів (steps, jobType, messageType, board, ruleIds, sm, llm)
   * ігнорується. Для інших статусів поля нижче обов'язкові, а
   * isBannerUpdate: true дає 400.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.user)
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({
    type: CreateJobDto,
    examples: {
      communication: {
        summary: 'Звичайна джоба (new / localization)',
        value: {
          steps: { step1: { status: 'pending' } },
          jobType: 'welcome',
          taskStatus: 'new',
          messageType: 'email',
          board: 'ONBOARDING',
          taskDescription: 'Опис завдання',
          ruleIds: ['0198c1a2-7b3e-7c11-9a55-3f2d8e6b1a01'],
          sm: '0198c1a2-7b3e-7c11-9a55-3f2d8e6b1a02',
          llm: 'gpt-5',
        },
      },
      htmlUpdate: {
        summary: 'Оновлення HTML листа (welcome/system_email_html_update)',
        value: { taskStatus: 'welcome_email_html_update', taskDescription: 'Оновити банер у листі', isBannerUpdate: true },
      },
    },
  })
  create(@Body() dto: CreateJobDto, @CurrentUser() user: JwtPayload): Promise<JobResponseDto> {
    return this.jobsService.create(dto, user.sub);
  }

  /**
   * Створює SEO-джобу (kind = seo). Окремий ендпоінт, щоб прапорець kind
   * виставляв бекенд, а не клієнт, і щоб DTO був суворим (поля communication
   * тут відхиляються як зайві).
   */
  @Post('seo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.user)
  @HttpCode(HttpStatus.CREATED)
  createSeo(@Body() dto: CreateSeoJobDto, @CurrentUser() user: JwtPayload): Promise<JobResponseDto> {
    return this.jobsService.createSeo(dto, user.sub);
  }

  /**
   * Створює design-джобу (kind = design): тіло містить лише taskDescription.
   * Окремий ендпоінт з тієї ж причини, що й /jobs/seo: kind виставляє бекенд,
   * а зайві поля (steps, llm, language, prompt, ruleIds, ...) відхиляються.
   */
  @Post('design')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.user)
  @HttpCode(HttpStatus.CREATED)
  createDesign(@Body() dto: CreateDesignJobDto, @CurrentUser() user: JwtPayload): Promise<JobResponseDto> {
    return this.jobsService.createDesign(dto, user.sub);
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
  @ApiOkResponse({ type: DeletedCountResponseDto })
  removeAll(): Promise<{ deletedCount: number }> {
    return this.jobsService.removeAll();
  }
}
