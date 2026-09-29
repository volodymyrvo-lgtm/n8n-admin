import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MessageType } from '../../generated/prisma/client.js';

/**
 * Query-параметри GET /jobs. У ТЗ фронта фільтр названо "jobType" зі
 * значеннями email/sms/web_push/notification_center/in_app — це точнісінько
 * enum MessageType (окреме поле jobType у нас лишається довільним рядком і
 * тут не фільтрується).
 */
export class FindJobsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** Захисний максимум — у ТЗ не вказаний, але немає сенсу дозволяти віддати весь стіл одним запитом. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** У запиті приходить рядком "email,sms" — розбиваємо в масив тут. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(MessageType, { each: true })
  jobType?: MessageType[];

  @IsOptional()
  @IsUUID()
  runnedById?: string;
}
