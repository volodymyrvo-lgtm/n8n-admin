import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Створення design-джоби (POST /jobs/design). Фронт надсилає лише опис
 * завдання. steps (спочатку порожній об'єкт, його наповнює n8n через PATCH),
 * kind, runnedById і runDate виставляє сервер, тому будь-яке інше поле
 * (steps, llm, language, prompt, ruleIds, ...) forbidNonWhitelisted відхиляє
 * як зайве.
 */
export class CreateDesignJobDto {
  /** Опис завдання (Task description). Зберігається в колонці task_description. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  taskDescription!: string;
}
