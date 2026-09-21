import { IsNotEmptyObject, IsObject } from 'class-validator';

export class UpdateGlossaryEntryDto {
  /** Часткові поля для злиття (shallow merge) з існуючим записом. */
  @IsObject()
  @IsNotEmptyObject()
  patch!: Record<string, unknown>;
}
