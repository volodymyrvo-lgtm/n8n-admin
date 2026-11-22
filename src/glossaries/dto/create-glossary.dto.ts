import { ArrayUnique, IsArray, IsEnum, IsNotEmptyObject, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JobKind } from '../../generated/prisma/client.js';

export class CreateGlossaryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  glossaryName!: string;

  /**
   * Довільна структура правил/термінів глосарія — форму визначає движок
   * генерації. БД вимагає непорожній JSON-об'єкт (constraint glossaries_rules_*).
   */
  @IsObject()
  @IsNotEmptyObject()
  allGlossRules!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  setType?: string[];

  /**
   * Для яких джоб цей глосарій. Необов'язкове — без нього створюється
   * communication (старі клієнти не ламаються). Як і в промптів, його можна
   * змінити через PATCH.
   */
  @IsOptional()
  @IsEnum(JobKind)
  kind?: JobKind;
}
