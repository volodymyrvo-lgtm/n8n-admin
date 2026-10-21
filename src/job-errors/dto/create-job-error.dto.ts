import { IsDefined, IsUUID } from 'class-validator';

/**
 * Тіло POST /job-errors — викликає n8n (X-API-Key). Помилка прив'язується до
 * джоби через jobId; саме `error` — довільний JSON (об'єкт, масив, рядок,
 * число), форму визначає n8n, єдина вимога — воно присутнє і не null.
 */
export class CreateJobErrorDto {
  @IsUUID()
  jobId!: string;

  @IsDefined()
  error!: unknown;
}
