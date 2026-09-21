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
import { CreateGlossaryDto } from './dto/create-glossary.dto.js';
import { CreateGlossaryEntryDto } from './dto/create-glossary-entry.dto.js';
import { GlossaryResponseDto } from './dto/glossary-response.dto.js';
import { UpdateGlossaryDto } from './dto/update-glossary.dto.js';
import { UpdateGlossaryEntryDto } from './dto/update-glossary-entry.dto.js';
import { GlossariesService } from './glossaries.service.js';

/**
 * JwtAuthGuard на рівні класу — усі методи вимагають хоча б валідний токен.
 * RolesGuard + @Roles(Role.admin) точково на створенні/оновленні/видаленні —
 * читання (GET) лишається доступним будь-якому залогіненому, як у rules/prompts.
 */
@Controller('glossaries')
@UseGuards(JwtAuthGuard)
export class GlossariesController {
  constructor(private readonly glossariesService: GlossariesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateGlossaryDto): Promise<GlossaryResponseDto> {
    return this.glossariesService.create(dto);
  }

  @Get()
  findAll(): Promise<GlossaryResponseDto[]> {
    return this.glossariesService.findAll();
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGlossaryDto): Promise<GlossaryResponseDto> {
    return this.glossariesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.glossariesService.remove(id);
  }

  // ---------- entries (один термін усередині allGlossRules.entries, за id) ----------

  @Get(':id/entries')
  listEntries(@Param('id', ParseUUIDPipe) id: string): Promise<unknown[]> {
    return this.glossariesService.listEntries(id);
  }

  @Post(':id/entries')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.CREATED)
  addEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGlossaryEntryDto,
  ): Promise<GlossaryResponseDto> {
    return this.glossariesService.addEntry(id, dto.entry);
  }

  @Patch(':id/entries/:entryId')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  updateEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateGlossaryEntryDto,
  ): Promise<GlossaryResponseDto> {
    return this.glossariesService.updateEntry(id, entryId, dto.patch);
  }

  @Delete(':id/entries/:entryId')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  removeEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ): Promise<GlossaryResponseDto> {
    return this.glossariesService.removeEntry(id, entryId);
  }
}
