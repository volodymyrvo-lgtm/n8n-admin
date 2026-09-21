import { IsNotEmptyObject, IsObject } from 'class-validator';

export class CreateGlossaryEntryDto {
  /**
   * Один запис глосарія — довільна структура (конкретні поля різняться між
   * мовними парами, напр. recommended_azerbaijani vs recommended_russian),
   * тому валідуємо лише "непорожній об'єкт". Наявність рядкового
   * english_term (ключ адресації для PATCH/DELETE) перевіряється окремо
   * в сервісі з людяним повідомленням про помилку.
   */
  @IsObject()
  @IsNotEmptyObject()
  entry!: Record<string, unknown>;
}
