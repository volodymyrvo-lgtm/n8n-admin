import { IsEnum, IsISO8601, IsNotEmptyObject, IsObject, IsOptional } from 'class-validator';
import { JobStatus } from '../../generated/prisma/client.js';

/**
 * Навмисно НЕ PartialType(CreateJobDto) — цей ендпоінт викликає n8n
 * (через окремий API-ключ, не JWT користувача), і йому можна оновлювати
 * лише прогрес виконання джоби: статуси кроків і загальний статус.
 * jobType/taskStatus/messageType/board/taskDescription/ruleId — незмінні
 * після створення, щоб компрометація API-ключа не дозволяла переприв'язати
 * джобу до іншого правила чи підмінити її метадані.
 */
export class UpdateJobDto {
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  steps?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  /**
   * @deprecated runDate тепер задається лише при створенні (POST /jobs) і
   * більше не оновлюється тут. Поле навмисно лишили в DTO — щоб n8n, який
   * і далі може його присилати за старою звичкою, отримував успішну
   * відповідь замість 400 (forbidNonWhitelisted) — але значення повністю
   * ігнорується сервісом (дивись JobsService.update()).
   */
  @IsOptional()
  @IsISO8601()
  runDate?: string;

  /**
   * Витрати по джобі (ключ → сума), напр. {"gpt-4": 0.04}. Сервіс МЕРДЖИТЬ
   * ці ключі в поточний spend з БД (додає/оновлює лише передані ключі,
   * решту не чіпає) — це не повна заміна об'єкта.
   */
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  spend?: Record<string, number>;
}
