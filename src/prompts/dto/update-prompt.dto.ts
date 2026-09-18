import { PartialType } from '@nestjs/mapped-types';
import { CreatePromptDto } from './create-prompt.dto.js';

/**
 * Усі поля опційні — PATCH оновлює тільки те, що передали.
 * Валідація кожного поля (коли воно присутнє) успадковується від CreatePromptDto.
 */
export class UpdatePromptDto extends PartialType(CreatePromptDto) {}
