import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JobKind } from '../../generated/prisma/client.js';

export class CreatePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsString()
  @MinLength(1)
  message!: string;

  /**
   * Для яких джоб цей промпт. Необов'язкове — без нього створюється
   * communication, як було до появи SEO-джоб (старі клієнти не ламаються).
   */
  @IsOptional()
  @IsEnum(JobKind)
  kind?: JobKind;
}
