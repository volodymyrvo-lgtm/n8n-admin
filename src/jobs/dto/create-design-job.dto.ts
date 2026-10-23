import { Transform } from 'class-transformer';
import { IsNotEmptyObject, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Створення design-джоби (POST /jobs/design). Лише steps, llm і опис
 * завдання: поля SEO (language, prompt, pageTask), поля communication
 * (board, messageType, ...) і ruleIds тут не існують, тож forbidNonWhitelisted
 * відсікає їх як зайві. kind = design, runnedById і runDate виставляє сервер.
 */
export class CreateDesignJobDto {
  @IsObject()
  @IsNotEmptyObject()
  steps!: Record<string, unknown>;

  /** Назва LLM-моделі, напр. "gpt_5_6_sol". */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  llm!: string;

  /** Опис завдання (Task description). Зберігається в колонці task_description. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  taskDescription!: string;
}
