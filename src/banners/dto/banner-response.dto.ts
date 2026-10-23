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

export class PaginatedBannersResponseDto {
  items!: BannerListItemDto[];
  /** Кількість банерів, що відповідають фільтрам (не загальна кількість у системі). */
  total!: number;
  page!: number;
  limit!: number;
}
