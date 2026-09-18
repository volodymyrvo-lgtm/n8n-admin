import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
