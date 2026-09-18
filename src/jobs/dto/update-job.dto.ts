import { IsEnum, IsISO8601, IsNotEmptyObject, IsObject, IsOptional } from 'class-validator';
import { JobStatus } from '../../generated/prisma/client.js';

/**
 * Навмисно НЕ PartialType(CreateJobDto) — цей ендпоінт викликає n8n
 * (через окремий API-ключ, не JWT користувача), і йому можна оновлювати
 * лише прогрес виконання джоби: статуси кроків, загальний статус і дату
 * запуску. jobType/taskStatus/messageType/board/taskDescription/ruleId —
 * незмінні після створення, щоб компрометація API-ключа не дозволяла
 * переприв'язати джобу до іншого правила чи підмінити її метадані.
 */
export class UpdateJobDto {
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  steps?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsISO8601()
  runDate?: string;
}
