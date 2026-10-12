import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Один елемент масиву, який n8n щодня надсилає за ВЧОРАШНІЙ день. Назви
 * полів — як у payload n8n (зокрема snake_case llm_mod).
 */
export class LlmUsageItemDto {
  /**
   * Приходить від n8n (date|flow|llm_mod), але сервер його ігнорує: ключ і
   * так складається з трьох полів нижче. Поле лишили в DTO, щоб
   * forbidNonWhitelisted не повертав 400 на коректний payload.
   */
  @IsOptional()
  @IsString()
  reportKey?: string;

  @Matches(DAY_REGEX, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  flow!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  llm_mod!: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  requests!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  inputTokens!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  outputTokens!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  cacheReadTokens!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  cacheWriteTokens!: number;

  /** Довгі float-хвости (0.30000000000000004) нормальні для JS — округлюємо в сервісі, а не відхиляємо. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000_000)
  cost!: number;
}
