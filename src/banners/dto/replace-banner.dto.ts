import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Текстові поля multipart-форми PUT /banners/:id/image (сам файл — у полі "file"). */
export class ReplaceBannerDto {
  /** Нова назва банера. Не передано (або порожньо) — лишається попередня. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  figmaImageName?: string;
}
