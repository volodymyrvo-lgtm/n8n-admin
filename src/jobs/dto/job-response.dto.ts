import { Board, JobStatus, MessageType, TaskStatus } from '../../generated/prisma/client.js';

export class JobResponseDto {
  id!: string;
  /** Довільний JSON — форму (і статуси кроків) визначає n8n. */
  steps!: unknown;
  jobType!: string;
  taskStatus!: TaskStatus;
  messageType!: MessageType;
  board!: Board;
  taskDescription!: string;
  status!: JobStatus;
  runDate!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  /** id усіх правил, на які посилається ця джоба (many-to-many через JobRule). */
  ruleIds!: string[];
  runnedById!: string | null;
  /** Довільний UUID з іншої системи, без FK-зв'язку. Null у старих джобах. */
  sm!: string | null;
  /** Опціональне посилання на глосарій (id), без enforced FK. */
  glossaryId!: string | null;
  /** Назва LLM-моделі. Null у старих джобах. */
  llm!: string | null;
  /** Витрати по джобі, ключ → сума. Завжди об'єкт (мінімум {}), не null. */
  spend!: Record<string, number>;
}
