import { JobKind } from '../../generated/prisma/client.js';

export class GlossaryResponseDto {
  id!: string;
  glossaryName!: string;
  /** Довільний JSON — форму визначає движок генерації. */
  allGlossRules!: unknown;
  setType!: string[];
  /** Для яких джоб глосарій: communication, seo, design або blog_ai. */
  kind!: JobKind;
  createdAt!: Date;
  updatedAt!: Date;
}
