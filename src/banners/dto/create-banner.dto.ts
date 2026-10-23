import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Текстові поля multipart-форми POST /banners (сам файл — у полі "file"). */
export class CreateBannerDto {
  /** Назва фрейму/картинки у Figma. Не унікальна: банер можуть перегенерувати. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  figmaImageName!: string;

  /** Джоба, що породила банер (необов'язково). Порожній рядок із форми = не задано. */
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
