export class RuleResponseDto {
  id!: string;
  ruleName!: string;
  /** Довільний JSON — форму визначає движок виконання джобів. */
  ruleSet!: unknown;
  setType!: string[];
  createdAt!: Date;
  updatedAt!: Date;
}
