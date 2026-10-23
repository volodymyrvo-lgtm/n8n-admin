import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { BannerStatus } from '../../generated/prisma/client.js';

/** Query-параметри GET /banners. Без фільтрів повертає банери всіх статусів, найновіші першими. */
export class FindBannersQueryDto {
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

  /** "pending,rejected" або повтор ?status=a&status=b — обидва варіанти дають масив. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const items = Array.isArray(value) ? value : [value];
    return items.flatMap((v: unknown) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        : [v],
    );
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(BannerStatus, { each: true })
  status?: BannerStatus[];

  @IsOptional()
  @IsUUID()
  jobId?: string;

  /** Пошук за частиною назви з Figma, без урахування регістру. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
