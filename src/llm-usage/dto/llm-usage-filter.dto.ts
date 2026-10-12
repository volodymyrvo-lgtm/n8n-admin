import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { DAY_REGEX } from './llm-usage-item.dto.js';

/** "a,b" або ?x=a&x=b → ['a','b']. */
const toStringArray = ({ value }: { value: unknown }): unknown => {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
  if (parts === null) {
    return value;
  }

  return parts
    .flatMap((part) => (typeof part === 'string' ? part.split(',') : [part]))
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part) => part !== '');
};

/** Фільтри, спільні для списку рядків і для summary. */
export class LlmUsageFilterDto {
  /** Конкретний день. Взаємовиключний з from/to. */
  @IsOptional()
  @Matches(DAY_REGEX, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  /** Початок періоду, включно. */
  @IsOptional()
  @Matches(DAY_REGEX, { message: 'from must be in YYYY-MM-DD format' })
  from?: string;

  /** Кінець періоду, включно. */
  @IsOptional()
  @Matches(DAY_REGEX, { message: 'to must be in YYYY-MM-DD format' })
  to?: string;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  flow?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  type?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  llmMod?: string[];
}

export const LLM_USAGE_SORT_FIELDS = ['date', 'cost', 'requests', 'inputTokens', 'outputTokens'] as const;
export type LlmUsageSortField = (typeof LLM_USAGE_SORT_FIELDS)[number];

/** GET /llm-usage — плоский список денних рядків з пагінацією. */
export class FindLlmUsageQueryDto extends LlmUsageFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 50;

  @IsOptional()
  @IsIn(LLM_USAGE_SORT_FIELDS)
  sortBy: LlmUsageSortField = 'date';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export const LLM_USAGE_GRANULARITIES = ['day', 'week', 'month', 'quarter', 'total'] as const;
export type LlmUsageGranularity = (typeof LLM_USAGE_GRANULARITIES)[number];

export const LLM_USAGE_GROUP_FIELDS = ['type', 'flow', 'llmMod'] as const;
export type LlmUsageGroupField = (typeof LLM_USAGE_GROUP_FIELDS)[number];

/** GET /llm-usage/summary — агрегація за період (+ опційно за type/flow/llmMod). */
export class LlmUsageSummaryQueryDto extends LlmUsageFilterDto {
  /** total — одна загальна сума за весь вибраний діапазон (period = null). */
  @IsOptional()
  @IsIn(LLM_USAGE_GRANULARITIES)
  granularity: LlmUsageGranularity = 'day';

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsIn(LLM_USAGE_GROUP_FIELDS, { each: true })
  groupBy?: LlmUsageGroupField[];
}
