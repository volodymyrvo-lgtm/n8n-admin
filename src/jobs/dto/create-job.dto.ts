import { ArrayNotEmpty, IsArray, IsEnum, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
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

  /** Джоба тепер може посилатись на кілька правил одразу. */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ruleIds!: string[];

  /**
   * Довільний UUID з іншої системи. Обов'язкове поле при створенні, але в
   * БД стовпець nullable (у старих джоб значення взяти нізвідки), тому
   * вимога "обов'язково" — тільки тут, на рівні DTO.
   */
  @IsUUID()
  sm!: string;

  /** Опціональне посилання на глосарій (id), без enforced FK у БД. */
  @IsOptional()
  @IsUUID()
  glossaryId?: string;

  /**
   * Назва LLM-моделі. Метадані джоби, як jobType/board — задається лише
   * тут, PATCH /jobs/:id (n8n) її змінити не може.
   */
  @IsString()
  @MinLength(1)
  llm!: string;
}
