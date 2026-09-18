import { ArrayNotEmpty, IsArray, IsNotEmptyObject, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  ruleName!: string;

  /**
   * Довільна структура умов правила. Конкретну форму визначає движок
   * виконання джобів, тут перевіряємо лише, що це непорожній JSON-об'єкт,
   * а не масив/примітив/null.
   */
  @IsObject()
  @IsNotEmptyObject()
  ruleSet!: Record<string, unknown>;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  setType!: string[];
}
