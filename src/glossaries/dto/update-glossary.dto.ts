import { PartialType } from '@nestjs/mapped-types';
import { CreateGlossaryDto } from './create-glossary.dto.js';

/** Усі поля опційні — PATCH оновлює тільки те, що передали. */
export class UpdateGlossaryDto extends PartialType(CreateGlossaryDto) {}
