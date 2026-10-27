import type { BannerStatus } from '../../generated/prisma/client.js';

/** storagePath навмисно не віддається: це внутрішня деталь сховища. */
export class BannerResponseDto {
  id!: string;
  jobId!: string | null;
  figmaImageName!: string;
  mimeType!: string;
  sizeBytes!: number;
  status!: BannerStatus;
  createdAt!: Date;
}

/** Елемент списку: те саме + тимчасове посилання на картинку для <img>. */
export class BannerListItemDto extends BannerResponseDto {
  /** Підписаний URL, діє ~10 хвилин. null, якщо файл у сховищі недоступний. */
  imageUrl!: string | null;
}

export class DeleteBannersResponseDto {
  /** Скільки банерів реально видалено. */
  deletedCount!: number;
  /** id з запиту, яких не існує (вже видалені або хибні): не помилка, просто повідомлення. */
  notFoundIds!: string[];
}

export class SendBannerResultDto {
  id!: string;
  figmaImageName!: string;
  /** sent — файл у Customer.io (банер у нас уже видалений); send_failed — не вдалось, причина в error. */
  status!: 'sent' | 'send_failed';
  /** id asset-а в Customer.io (лише для sent). */
  customerAssetId?: number;
  /** Що Customer.io повернув для файлу: ім'я й шлях (для звірки, чи правильний тип/розширення). */
  customerName?: string | null;
  customerPath?: string | null;
  error?: string;
  /** Напр. «файл завантажено, але статус не збережено» — для ручної перевірки. */
  warning?: string;
}

export class SendBannersResponseDto {
  /** Скільки банерів було до відправки (підходящих під запит). */
  total!: number;
  sent!: number;
  failed!: number;
  /** Скільки не встигли за час запиту: виклик повторюють, поки remaining > 0. */
  remaining!: number;
  /** id з ids, які не відправлені, бо не існують або вже sent. */
  skippedIds!: string[];
  results!: SendBannerResultDto[];
}

export class PaginatedBannersResponseDto {
  items!: BannerListItemDto[];
  /** Кількість банерів, що відповідають фільтрам (не загальна кількість у системі). */
  total!: number;
  page!: number;
  limit!: number;
}
