import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCustomerFolderDto {
  /** Назва папки; у межах однієї батьківської папки має бути унікальною (інакше 409). */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  /** id батьківської папки в Customer.io. Не передано або null — папка верхнього рівня. */
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;
}
