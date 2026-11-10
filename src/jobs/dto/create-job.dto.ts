import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, Matches, MinLength, ValidateIf } from 'class-validator';
import { Board, MessageType, TaskStatus } from '../../generated/prisma/client.js';
import { isHtmlUpdateTaskStatus } from '../html-update-task-status.js';
import { isShortCommunicationTaskStatus } from '../short-communication-task-status.js';

/**
 * Для taskStatus welcome_email_html_update / system_email_html_update приходять
 * лише taskStatus, taskDescription та необов'язковий isBannerUpdate, тому решта
 * полів для них не валідується (і сервіс її ігнорує).
 */
const notHtmlUpdate = (dto: { taskStatus?: unknown }): boolean => !isHtmlUpdateTaskStatus(dto.taskStatus);

/**
 * Для taskStatus short_communication_update приходять taskStatus, steps,
 * jobType, messageType і необов'язкова language: board, taskDescription,
 * ruleIds, sm і llm для нього не валідуються (і сервіс їх ігнорує).
 */
const notShortUpdate = (dto: { taskStatus?: unknown }): boolean => !isShortCommunicationTaskStatus(dto.taskStatus);

/** Поля, обов'язкові лише для «повних» джоб: не html_update і не short_communication_update. */
const fullCommunication = (dto: { taskStatus?: unknown }): boolean => notHtmlUpdate(dto) && notShortUpdate(dto);

export class CreateJobDto {
  /**
   * Довільна структура кроків workflow. Конкретну форму (масив/об'єкт з
   * кроками) визначає n8n, тут перевіряємо лише, що це непорожній JSON,
   * а не примітив/null. Статуси окремих кроків усередині цієї структури
   * потім оновлює n8n через PATCH /jobs/:id.
   */
  @ValidateIf(notHtmlUpdate)
  @IsObject()
  @IsNotEmptyObject()
  steps!: Record<string, unknown>;

  @ValidateIf(notHtmlUpdate)
  @IsString()
  @MinLength(1)
  jobType!: string;

  @IsEnum(TaskStatus)
  taskStatus!: TaskStatus;

  @ValidateIf(notHtmlUpdate)
  @IsEnum(MessageType)
  messageType!: MessageType;

  @ValidateIf(fullCommunication)
  @IsEnum(Board)
  board!: Board;

  @ValidateIf(notShortUpdate)
  @IsString()
  @MinLength(1)
  taskDescription!: string;

  /**
   * Прапорець «оновлення банера». Необов'язковий і допустимий лише для
   * taskStatus welcome_email_html_update / system_email_html_update; true для
   * інших статусів сервіс відхиляє (400). За замовчуванням false.
   */
  @IsOptional()
  @IsBoolean()
  isBannerUpdate?: boolean;

  /**
   * Джоба тепер може посилатись на кілька правил одразу. Для
   * taskStatus: 'update' фронт ховає цей вибір і завжди шле порожній
   * масив — тому тут лише "масив UUID-ів" (кожен елемент, якщо є, має бути
   * валідним UUID), а вимогу "непорожній" для інших taskStatus перевіряє
   * JobsService.create() (бо залежить від значення іншого поля — такого
   * в class-validator без зайвої плутанини декораторів не зробити чисто).
   */
  @ValidateIf(fullCommunication)
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
  @ValidateIf(fullCommunication)
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
  @ValidateIf(fullCommunication)
  @IsString()
  llm!: string;

  /**
   * Код мови, напр. "EN", "AZ", "RU". Необов'язковий для будь-якого taskStatus
   * (для html_update ігнорується). Пробіли по краях обрізаються, у БД
   * зберігається у верхньому регістрі.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z]{2,5}$/, { message: 'language must be 2-5 latin letters, e.g. "EN"' })
  language?: string;
}
