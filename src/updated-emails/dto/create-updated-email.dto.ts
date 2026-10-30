import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Максимальна довжина HTML листа (символів). Лист на пару мегабайт уже ненормальний. */
export const MAX_EMAIL_BODY_LENGTH = 2_000_000;

/** Тіло POST /updated-emails. */
export class CreateUpdatedEmailDto {
  /** Ідентифікатор листа. Пробіли по краях обрізаються. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  emailId!: string;

  /** HTML листа цілком. Зберігається як є, без обрізання й змін. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EMAIL_BODY_LENGTH)
  body!: string;
}
