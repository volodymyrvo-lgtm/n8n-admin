import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseArrayPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FindLlmUsageQueryDto, LlmUsageSummaryQueryDto } from './dto/llm-usage-filter.dto.js';
import { LlmUsageItemDto } from './dto/llm-usage-item.dto.js';
import {
  LlmUsageFiltersResponseDto,
  LlmUsageSummaryRowDto,
  PaginatedLlmUsageResponseDto,
} from './dto/llm-usage-response.dto.js';
import { LlmUsageService } from './llm-usage.service.js';

/** Захист від випадкового гігантського payload; реальний звіт — десятки рядків. */
const MAX_ITEMS_PER_REQUEST = 1000;

@Controller('llm-usage')
export class LlmUsageController {
  constructor(private readonly llmUsageService: LlmUsageService) {}

  /**
   * Щоденний звіт від n8n (X-API-Key, не JWT): масив рядків за вчорашній
   * день. Той самий день можна слати повторно — рядки перезаписуються.
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  upsertMany(
    @Body(new ParseArrayPipe({ items: LlmUsageItemDto, whitelist: true, forbidNonWhitelisted: true }))
    items: LlmUsageItemDto[],
  ): Promise<{ upserted: number }> {
    if (items.length === 0 || items.length > MAX_ITEMS_PER_REQUEST) {
      throw new BadRequestException(`Body must be an array of 1..${MAX_ITEMS_PER_REQUEST} items`);
    }

    return this.llmUsageService.upsertMany(items);
  }

  /** Плоский список денних рядків (для таблиці/експорту) з фільтрами, сортуванням і пагінацією. */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: FindLlmUsageQueryDto): Promise<PaginatedLlmUsageResponseDto> {
    return this.llmUsageService.findAll(query);
  }

  /** Агрегація витрат за день/тиждень/місяць/квартал/весь період, опційно з розбивкою за type/flow/llmMod. */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  summarize(@Query() query: LlmUsageSummaryQueryDto): Promise<LlmUsageSummaryRowDto[]> {
    return this.llmUsageService.summarize(query);
  }

  /** Довідник значень для фільтрів на фронті + мінімальна/максимальна доступна дата. */
  @Get('filters')
  @UseGuards(JwtAuthGuard)
  getFilters(): Promise<LlmUsageFiltersResponseDto> {
    return this.llmUsageService.getFilters();
  }
}
