import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../generated/prisma/client.js';
import { CreateRuleDto } from './dto/create-rule.dto.js';
import { RuleResponseDto } from './dto/rule-response.dto.js';
import { UpdateRuleDto } from './dto/update-rule.dto.js';
import { RulesService } from './rules.service.js';

/**
 * JwtAuthGuard на рівні класу — усі методи вимагають хоча б валідний токен.
 * RolesGuard + @Roles(Role.admin) точково на створенні/оновленні/видаленні —
 * читання (GET) лишається доступним будь-якому залогіненому, незалежно від ролі.
 */
@Controller('rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRuleDto): Promise<RuleResponseDto> {
    return this.rulesService.create(dto);
  }

  @Get()
  findAll(): Promise<RuleResponseDto[]> {
    return this.rulesService.findAll();
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto): Promise<RuleResponseDto> {
    return this.rulesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rulesService.remove(id);
  }
}
