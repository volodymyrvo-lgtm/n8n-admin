import { JobKind } from '../../generated/prisma/client.js';

export class RuleResponseDto {
  id!: string;
  ruleName!: string;
  /** Довільний JSON — форму визначає движок виконання джобів. */
  ruleSet!: unknown;
  setType!: string[];
  /** Для яких джоб правило: communication, seo або design. */
  kind!: JobKind;
  createdAt!: Date;
  updatedAt!: Date;
}
