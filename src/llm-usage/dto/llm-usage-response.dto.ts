export class LlmUsageRowDto {
  id!: string;
  /** YYYY-MM-DD */
  date!: string;
  flow!: string;
  type!: string;
  llmMod!: string;
  requests!: number;
  inputTokens!: number;
  outputTokens!: number;
  cacheReadTokens!: number;
  cacheWriteTokens!: number;
  cost!: number;
}

export class PaginatedLlmUsageResponseDto {
  items!: LlmUsageRowDto[];
  total!: number;
  page!: number;
  limit!: number;
}

export class LlmUsageSummaryRowDto {
  /** Початок періоду (YYYY-MM-DD): день / понеділок / 1-ше число місяця / початок кварталу. null для granularity=total. */
  period!: string | null;
  type?: string;
  flow?: string;
  llmMod?: string;
  requests!: number;
  inputTokens!: number;
  outputTokens!: number;
  cacheReadTokens!: number;
  cacheWriteTokens!: number;
  cost!: number;
}

/** Значення для випадайок фільтрів на фронті + межі доступних дат. */
export class LlmUsageFiltersResponseDto {
  flows!: string[];
  types!: string[];
  llmMods!: string[];
  minDate!: string | null;
  maxDate!: string | null;
}
