/** Підсумок синхронізації папок Customer.io (POST /customer-folders/sync). */
export class SyncResultDto {
  /** Скільки папок прийшло з Customer.io. */
  total!: number;
  created!: number;
  updated!: number;
  unchanged!: number;
  /** Скільки папок видалено з БД, бо їх більше немає в Customer.io. */
  deleted!: number;
}
