import { ArrayUnique, IsArray, IsNotEmptyObject, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
