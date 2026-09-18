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
import { CreatePromptDto } from './dto/create-prompt.dto.js';
import { PromptResponseDto } from './dto/prompt-response.dto.js';
import { UpdatePromptDto } from './dto/update-prompt.dto.js';
import { PromptsService } from './prompts.service.js';

/**
 * JwtAuthGuard на рівні класу — усі методи вимагають хоча б валідний токен.
 * RolesGuard + @Roles(Role.admin) точково на створенні/оновленні/видаленні —
 * читання (GET) лишається доступним будь-якому залогіненому, незалежно від ролі.
 */
@Controller('prompts')
@UseGuards(JwtAuthGuard)
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePromptDto): Promise<PromptResponseDto> {
    return this.promptsService.create(dto);
  }

  @Get()
  findAll(): Promise<PromptResponseDto[]> {
    return this.promptsService.findAll();
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromptDto): Promise<PromptResponseDto> {
    return this.promptsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.promptsService.remove(id);
  }
}
