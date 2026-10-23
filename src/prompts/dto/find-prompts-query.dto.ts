import { IsEnum, IsOptional } from 'class-validator';
import { JobKind } from '../../generated/prisma/client.js';

export class FindPromptsQueryDto {
  /**
   * Вид промптів у списку. За замовчуванням communication — щоб наявна
   * сторінка промптів не почала показувати SEO- чи design-промпти;
   * відповідна сторінка просить kind=seo або kind=design явно.
   */
  @IsOptional()
  @IsEnum(JobKind)
  kind: JobKind = JobKind.communication;
}
