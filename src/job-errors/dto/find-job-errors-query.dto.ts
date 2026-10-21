import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class FindJobErrorsQueryDto {
  /** Лише помилки цієї джоби. Без нього — помилки всіх джоб. */
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 50;
}
