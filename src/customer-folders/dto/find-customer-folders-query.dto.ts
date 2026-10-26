import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FindCustomerFoldersQueryDto {
  /** Пошук за частиною назви, без урахування регістру. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  search?: string;
}
