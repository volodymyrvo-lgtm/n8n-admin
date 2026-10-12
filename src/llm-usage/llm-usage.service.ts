import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FindLlmUsageQueryDto,
  LlmUsageFilterDto,
  LlmUsageGranularity,
  LlmUsageGroupField,
  LlmUsageSummaryQueryDto,
} from './dto/llm-usage-filter.dto.js';
import { LlmUsageItemDto } from './dto/llm-usage-item.dto.js';
import {
  LlmUsageFiltersResponseDto,
  LlmUsageRowDto,
  LlmUsageSummaryRowDto,
  PaginatedLlmUsageResponseDto,
} from './dto/llm-usage-response.dto.js';
import { resolveFlowType } from './flow-type.js';

type LlmUsageRecord = Prisma.LlmUsageDailyGetPayload<object>;

/** Білий список: значення з query НІКОЛИ не підставляється в SQL як текст, лише ці літерали. */
const GROUP_COLUMNS: Record<LlmUsageGroupField, string> = {
  type: '"type"',
  flow: '"flow"',
  llmMod: '"llm_mod"',
};

const PERIOD_UNITS: Record<Exclude<LlmUsageGranularity, 'day' | 'total'>, string> = {
  week: 'week',
  month: 'month',
  quarter: 'quarter',
};

@Injectable()
export class LlmUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Щоденний звіт від n8n. Дані за день приходять цілими, тож рядок
   * (date, flow, llm_mod) ПЕРЕЗАПИСУЄТЬСЯ, а не сумується — повторна
   * відправка того ж дня (ретрай, ручний перезапуск) безпечна.
   */
  async upsertMany(items: LlmUsageItemDto[]): Promise<{ upserted: number }> {
    await this.prisma.$transaction(
      items.map((item) => {
        const date = LlmUsageService.parseDay(item.date, 'date');
        const values = {
          // type перераховується й при перезаписі — якщо правила змінились,
          // повторна відправка дня виправить його.
          type: resolveFlowType(item.flow),
          requests: item.requests,
          inputTokens: BigInt(item.inputTokens),
          outputTokens: BigInt(item.outputTokens),
          cacheReadTokens: BigInt(item.cacheReadTokens),
          cacheWriteTokens: BigInt(item.cacheWriteTokens),
          // JS-float (0.30000000000000004) → рівно 8 знаків, як у стовпці.
          cost: new Prisma.Decimal(item.cost).toDecimalPlaces(8),
        };

        return this.prisma.llmUsageDaily.upsert({
          where: { date_flow_llmMod: { date, flow: item.flow, llmMod: item.llm_mod } },
          create: { date, flow: item.flow, llmMod: item.llm_mod, ...values },
          update: values,
        });
      }),
    );

    return { upserted: items.length };
  }

  async findAll(query: FindLlmUsageQueryDto): Promise<PaginatedLlmUsageResponseDto> {
    const where = LlmUsageService.buildWhere(query);

    const [records, total] = await this.prisma.$transaction([
      this.prisma.llmUsageDaily.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.order }, { flow: 'asc' }, { llmMod: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.llmUsageDaily.count({ where }),
    ]);

    return { items: records.map(LlmUsageService.toRowDto), total, page: query.page, limit: query.limit };
  }

  /**
   * Агрегація за день/тиждень/місяць/квартал (або загальна сума). Prisma
   * groupBy не вміє обрізати дату до тижня/кварталу, тому тут $queryRaw
   * з date_trunc. Усі значення з query йдуть параметрами; у SQL-текст
   * потрапляють лише літерали з білих списків вище.
   */
  async summarize(query: LlmUsageSummaryQueryDto): Promise<LlmUsageSummaryRowDto[]> {
    const { from, to } = LlmUsageService.resolveRange(query);
    const conditions: Prisma.Sql[] = [];

    if (from) {
      conditions.push(Prisma.sql`"date" >= ${from}::date`);
    }
    if (to) {
      conditions.push(Prisma.sql`"date" <= ${to}::date`);
    }
    if (query.flow) {
      conditions.push(Prisma.sql`"flow" IN (${Prisma.join(query.flow)})`);
    }
    if (query.type) {
      conditions.push(Prisma.sql`"type" IN (${Prisma.join(query.type)})`);
    }
    if (query.llmMod) {
      conditions.push(Prisma.sql`"llm_mod" IN (${Prisma.join(query.llmMod)})`);
    }

    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const dimensions: Prisma.Sql[] = [];
    const isTotal = query.granularity === 'total';

    if (query.granularity === 'total') {
      dimensions.push(Prisma.sql`NULL::text AS "period"`);
    } else if (query.granularity === 'day') {
      dimensions.push(Prisma.sql`to_char("date", 'YYYY-MM-DD') AS "period"`);
    } else {
      const unit = Prisma.raw(`'${PERIOD_UNITS[query.granularity]}'`);
      dimensions.push(Prisma.sql`to_char(date_trunc(${unit}, "date"), 'YYYY-MM-DD') AS "period"`);
    }

    const groups = [...new Set(query.groupBy ?? [])];
    for (const group of groups) {
      dimensions.push(Prisma.raw(`${GROUP_COLUMNS[group]} AS "${group}"`));
    }

    // GROUP BY / ORDER BY за ординалами колонок-вимірів (period — завжди
    // перша, окрім total, де це константа й групувати за нею не треба).
    const firstGroupable = isTotal ? 2 : 1;
    const ordinals = Array.from({ length: dimensions.length - firstGroupable + 1 }, (_, i) => i + firstGroupable);
    const groupBy = ordinals.length > 0 ? Prisma.sql`GROUP BY ${Prisma.raw(ordinals.join(', '))}` : Prisma.empty;
    const orderBy = ordinals.length > 0 ? Prisma.sql`ORDER BY ${Prisma.raw(ordinals.join(', '))}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        ${Prisma.join(dimensions)},
        COALESCE(SUM("requests"), 0)::float8 AS "requests",
        COALESCE(SUM("input_tokens"), 0)::float8 AS "inputTokens",
        COALESCE(SUM("output_tokens"), 0)::float8 AS "outputTokens",
        COALESCE(SUM("cache_read_tokens"), 0)::float8 AS "cacheReadTokens",
        COALESCE(SUM("cache_write_tokens"), 0)::float8 AS "cacheWriteTokens",
        COALESCE(ROUND(SUM("cost"), 8), 0)::float8 AS "cost"
      FROM "llm_usage_daily"
      ${where}
      ${groupBy}
      ${orderBy}
    `;

    return rows.map((row) => row as unknown as LlmUsageSummaryRowDto);
  }

  /** Значення для випадайок фільтрів та межі дат, доступних на дашборді. */
  async getFilters(): Promise<LlmUsageFiltersResponseDto> {
    const [flows, types, llmMods, range] = await Promise.all([
      this.prisma.llmUsageDaily.findMany({ distinct: ['flow'], select: { flow: true }, orderBy: { flow: 'asc' } }),
      this.prisma.llmUsageDaily.findMany({ distinct: ['type'], select: { type: true }, orderBy: { type: 'asc' } }),
      this.prisma.llmUsageDaily.findMany({ distinct: ['llmMod'], select: { llmMod: true }, orderBy: { llmMod: 'asc' } }),
      this.prisma.llmUsageDaily.aggregate({ _min: { date: true }, _max: { date: true } }),
    ]);

    return {
      flows: flows.map((r) => r.flow),
      types: types.map((r) => r.type),
      llmMods: llmMods.map((r) => r.llmMod),
      minDate: range._min.date ? LlmUsageService.formatDay(range._min.date) : null,
      maxDate: range._max.date ? LlmUsageService.formatDay(range._max.date) : null,
    };
  }

  private static buildWhere(query: LlmUsageFilterDto): Prisma.LlmUsageDailyWhereInput {
    const { from, to } = LlmUsageService.resolveRange(query);

    return {
      date: from || to ? { gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined, lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined } : undefined,
      flow: query.flow ? { in: query.flow } : undefined,
      type: query.type ? { in: query.type } : undefined,
      llmMod: query.llmMod ? { in: query.llmMod } : undefined,
    };
  }

  /** `date` — це from = to = date. Перевіряє календарну коректність і що from <= to. */
  private static resolveRange(query: LlmUsageFilterDto): { from?: string; to?: string } {
    if (query.date !== undefined && (query.from !== undefined || query.to !== undefined)) {
      throw new BadRequestException('Use either "date" or "from"/"to", not both');
    }

    const from = query.date ?? query.from;
    const to = query.date ?? query.to;

    if (from !== undefined) {
      LlmUsageService.parseDay(from, query.date !== undefined ? 'date' : 'from');
    }
    if (to !== undefined) {
      LlmUsageService.parseDay(to, query.date !== undefined ? 'date' : 'to');
    }
    if (from !== undefined && to !== undefined && from > to) {
      throw new BadRequestException('"from" must not be later than "to"');
    }

    return { from, to };
  }

  /** YYYY-MM-DD → Date (UTC-північ). Відсікає неіснуючі дати на кшталт 2026-02-31. */
  private static parseDay(value: string, field: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || LlmUsageService.formatDay(date) !== value) {
      throw new BadRequestException(`${field} is not a valid calendar date`);
    }

    return date;
  }

  private static formatDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private static toRowDto(record: LlmUsageRecord): LlmUsageRowDto {
    return {
      id: record.id,
      date: LlmUsageService.formatDay(record.date),
      flow: record.flow,
      type: record.type,
      llmMod: record.llmMod,
      requests: record.requests,
      // BigInt не серіалізується в JSON; значення в межах безпечних 2^53.
      inputTokens: Number(record.inputTokens),
      outputTokens: Number(record.outputTokens),
      cacheReadTokens: Number(record.cacheReadTokens),
      cacheWriteTokens: Number(record.cacheWriteTokens),
      cost: record.cost.toNumber(),
    };
  }
}
