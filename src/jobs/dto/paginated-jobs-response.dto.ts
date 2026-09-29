import { JobResponseDto } from './job-response.dto.js';

/** Формат відповіді GET /jobs згідно з ТЗ пагінації. */
export class PaginatedJobsResponseDto {
  items!: JobResponseDto[];
  /** Кількість джоб, що відповідають поточним фільтрам (не загальна кількість у системі). */
  total!: number;
  page!: number;
  limit!: number;
}
