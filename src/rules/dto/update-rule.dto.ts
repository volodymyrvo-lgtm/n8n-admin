import { PartialType } from '@nestjs/mapped-types';
import { CreateRuleDto } from './create-rule.dto.js';

/**
 * Усі поля опційні — PATCH оновлює тільки те, що передали.
 * Валідація кожного поля (коли воно присутнє) успадковується від CreateRuleDto.
 */
export class UpdateRuleDto extends PartialType(CreateRuleDto) {}
