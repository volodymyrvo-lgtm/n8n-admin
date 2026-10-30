import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trimToUndefined = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() || undefined : value);

/** Query-параметри GET /updated-emails. Без фільтрів повертає всі листи, найновіші першими. */
export class FindUpdatedEmailsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** Точний emailId: усі версії одного листа. */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(255)
  emailId?: string;

  /** Пошук за частиною emailId, без урахування регістру. */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(255)
  search?: string;
}
