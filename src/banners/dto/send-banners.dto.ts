import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { MAX_BULK_DELETE } from './delete-banners.dto.js';

/** Body POST /banners/send. Усі поля необов'язкові. */
export class SendBannersDto {
  /** id папки Customer.io, куди класти файли (id зі списку GET /customer-folders). Не передано або null — корінь. */
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;

  /** Відправити лише ці банери. Не передано — усі, що ще не sent. Від 1 до 500 uuid. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (Array.isArray(value) ? [...new Set(value as unknown[])] : value))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_DELETE)
  @IsUUID(undefined, { each: true })
  ids?: string[];
}
