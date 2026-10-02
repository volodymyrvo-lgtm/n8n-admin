import { IsArray, IsEnum, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Board, MessageType, TaskStatus } from '../../generated/prisma/client.js';

export class CreateJobDto {
  /**
   * Довільна структура кроків workflow. Конкретну форму (масив/об'єкт з
   * кроками) визначає n8n, тут перевіряємо лише, що це непорожній JSON,
   * а не примітив/null. Статуси окремих кроків усередині цієї структури
   * потім оновлює n8n через PATCH /jobs/:id.
   */
  @IsObject()
  @IsNotEmptyObject()
  steps!: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  jobType!: string;

  @IsEnum(TaskStatus)
  taskStatus!: TaskStatus;

  @IsEnum(MessageType)
  messageType!: MessageType;

  @IsEnum(Board)
  board!: Board;

  @IsString()
  @MinLength(1)
  taskDescription!: string;

  /**
   * Джоба тепер може посилатись на кілька правил одразу. Для
   * taskStatus: 'update' фронт ховає цей вибір і завжди шле порожній
   * масив — тому тут лише "масив UUID-ів" (кожен елемент, якщо є, має бути
   * валідним UUID), а вимогу "непорожній" для інших taskStatus перевіряє
   * JobsService.create() (бо залежить від значення іншого поля — такого
   * в class-validator без зайвої плутанини декораторів не зробити чисто).
   */
  @IsArray()
  @IsUUID('all', { each: true })
  ruleIds!: string[];

  /**
   * Довільний UUID з іншої системи. Обов'язкове поле для всіх taskStatus,
   * КРІМ 'update' — там поле приховане на фронті і завжди приходить
   * порожнім рядком ("" — не валідний UUID), тому тут лише @IsString().
   * Реальну вимогу "має бути UUID" перевіряє JobsService.create() залежно
   * від taskStatus. У БД стовпець до того ж типізований як uuid (не text),
   * тож порожній рядок нормалізується в null перед записом (сервіс).
   */
  @IsString()
  sm!: string;

  /** Опціональне посилання на глосарій (id), без enforced FK у БД. */
  @IsOptional()
  @IsUUID()
  glossaryId?: string;

  /**
   * Назва LLM-моделі. Метадані джоби, як jobType/board — задається лише
   * тут, PATCH /jobs/:id (n8n) її змінити не може. Як і sm/ruleIds вище —
   * обов'язкове (непорожнє) для всіх taskStatus, КРІМ 'update', де фронт
   * шле порожній рядок; реальну вимогу перевіряє JobsService.create().
   */
  @IsString()
  llm!: string;
}
