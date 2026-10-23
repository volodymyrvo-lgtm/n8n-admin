import { IsEnum, IsOptional } from 'class-validator';
import { JobKind } from '../../generated/prisma/client.js';

export class FindRulesQueryDto {
  /**
   * Вид правил у списку. За замовчуванням communication — щоб наявна
   * сторінка правил і форма створення розсилок не почали показувати
   * SEO- чи design-правила; відповідна сторінка просить kind=seo або
   * kind=design явно.
   */
  @IsOptional()
  @IsEnum(JobKind)
  kind: JobKind = JobKind.communication;
}
