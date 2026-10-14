import { JobKind } from '../../generated/prisma/client.js';

export class PromptResponseDto {
  id!: string;
  name!: string;
  message!: string;
  /** Для яких джоб промпт: communication або seo. */
  kind!: JobKind;
  createdAt!: Date;
  updatedAt!: Date;
}
