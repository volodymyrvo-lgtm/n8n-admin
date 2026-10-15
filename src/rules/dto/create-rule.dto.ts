import { ArrayNotEmpty, IsArray, IsNotEmptyObject, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Спільний для POST /rules (communication) і POST /rules/seo (seo). Поля
 * kind тут свідомо немає: вид правила визначає роут, яким його створили, а не
 * клієнт, — зайвий kind у тілі відхиляється як невідоме поле.
 */
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
