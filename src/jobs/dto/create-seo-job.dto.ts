import { Transform } from 'class-transformer';
import { IsNotEmptyObject, IsObject, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Створення SEO-джоби (POST /jobs/seo). Свідомо окремий DTO, а не гілка в
 * CreateJobDto: поля communication-джоби (board, messageType, ruleIds, ...)
 * тут просто не існують, тож forbidNonWhitelisted відсікає їх як зайві.
 * kind = seo, runnedById і runDate виставляє сервер, а не клієнт.
 */
export class CreateSeoJobDto {
  @IsObject()
  @IsNotEmptyObject()
  steps!: Record<string, unknown>;

  /** Код мови, напр. "EN", "AZ", "RU". Нормалізується до верхнього регістру в сервісі. */
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z]{2,5}$/, { message: 'language must be 2-5 latin letters, e.g. "EN"' })
  language!: string;

  /** Назва LLM-моделі, напр. "gpt_5_6_sol". */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  llm!: string;

  /** Просто рядок, зберігається як є (напр. "EN 6eed9bdc-…"), без розбору. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  prompt!: string;

  /** Завдання для сторінки, напр. "R048 · Кено". */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  pageTask!: string;
}
