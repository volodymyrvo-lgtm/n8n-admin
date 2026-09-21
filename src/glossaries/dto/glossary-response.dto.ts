export class GlossaryResponseDto {
  id!: string;
  glossaryName!: string;
  /** Довільний JSON — форму визначає движок генерації. */
  allGlossRules!: unknown;
  setType!: string[];
  createdAt!: Date;
  updatedAt!: Date;
}
