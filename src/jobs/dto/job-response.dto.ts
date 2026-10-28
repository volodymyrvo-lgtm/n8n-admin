import { Board, JobKind, JobStatus, MessageType, TaskStatus } from '../../generated/prisma/client.js';

export class JobResponseDto {
  id!: string;
  /** Довільний JSON — форму (і статуси кроків) визначає n8n. */
  steps!: unknown;
  /** Вид джоби: communication (розсилки CRM), seo (генерація SEO-сторінок) або design. */
  kind!: JobKind;
  /**
   * jobType/taskStatus/messageType/board — лише для kind = communication, в інших null.
   * taskDescription є в communication і design, у seo-джобах null.
   */
  jobType!: string | null;
  taskStatus!: TaskStatus | null;
  messageType!: MessageType | null;
  board!: Board | null;
  taskDescription!: string | null;
  /** Прапорець «оновлення банера»; true лише для статусів welcome/system_email_html_update. */
  isBannerUpdate!: boolean;
  /** Поля SEO-джоби (kind = seo), у communication-джобах null. */
  language!: string | null;
  prompt!: string | null;
  pageTask!: string | null;
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
  /** Посилання на згенеровану таблицю. Null, поки n8n не проставить через PATCH. */
  tableUrl!: string | null;
}
