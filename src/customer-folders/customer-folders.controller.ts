import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiConflictResponse, ApiOkResponse } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../generated/prisma/client.js';
import { SyncResultDto } from './dto/sync-result.dto.js';
import { CreateCustomerFolderDto } from './dto/create-customer-folder.dto.js';
import type { CustomerFolderResponseDto, CustomerFoldersListResponseDto } from './dto/customer-folder-response.dto.js';
import { FindCustomerFoldersQueryDto } from './dto/find-customer-folders-query.dto.js';
import { CustomerFoldersService, type SyncResult } from './customer-folders.service.js';

@Controller('customer-folders')
export class CustomerFoldersController {
  constructor(private readonly customerFoldersService: CustomerFoldersService) {}

  /**
   * Папки Customer.io для фронта (JWT, будь-яка роль). Читає з нашої БД, яку
   * наповнює синхронізація. ?search= — за частиною назви.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: FindCustomerFoldersQueryDto): Promise<CustomerFoldersListResponseDto> {
    return this.customerFoldersService.findAll(query);
  }

  /**
   * Створює папку в Customer.io (admin, user). Body: { name, parentId? }; без
   * parentId (або null) папка верхнього рівня. 409 — така назва вже є в цій
   * батьківській папці, 404 — батьківської папки немає в Customer.io.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.user)
  @ApiConflictResponse({ description: 'Папка з такою назвою вже є в цій батьківській папці' })
  @ApiBadGatewayResponse({ description: 'Customer.io недоступний або повернув помилку' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCustomerFolderDto): Promise<CustomerFolderResponseDto> {
    return this.customerFoldersService.create(dto);
  }

  /**
   * Запускає синхронізацію зараз (X-API-Key, без ролей). Потрібен, бо на
   * безкоштовному Render сервіс може спати о 03:00 і внутрішній cron не
   * спрацює: n8n або зовнішній планувальник щодня будить бекенд цим викликом.
   */
  @Post('sync')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SyncResultDto })
  @ApiConflictResponse({ description: 'Синхронізація вже виконується' })
  @ApiBadGatewayResponse({ description: 'Customer.io недоступний або повернув помилку' })
  sync(): Promise<SyncResult> {
    return this.customerFoldersService.sync();
  }
}
