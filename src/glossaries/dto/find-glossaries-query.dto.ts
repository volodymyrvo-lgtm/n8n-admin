import { IsEnum, IsOptional } from 'class-validator';
import { JobKind } from '../../generated/prisma/client.js';

export class FindGlossariesQueryDto {
  /**
   * Вид глосаріїв у списку. За замовчуванням communication — щоб наявна
   * сторінка глосаріїв не почала показувати глосарії інших видів (напр.
   * blog_ai); відповідна сторінка просить kind=blog_ai явно.
   */
  @IsOptional()
  @IsEnum(JobKind)
  kind: JobKind = JobKind.communication;
}
