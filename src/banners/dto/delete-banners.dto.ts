import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export const MAX_BULK_DELETE = 500;

/** Body POST /banners/bulk-delete: які банери видалити (решта лишається). */
export class DeleteBannersDto {
  /** id банерів (uuid), від 1 до 500. Повтори прибираються. */
  @Transform(({ value }: { value: unknown }) => (Array.isArray(value) ? [...new Set(value as unknown[])] : value))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_DELETE)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
