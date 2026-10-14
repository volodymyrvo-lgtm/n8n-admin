import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobKind, Prisma } from '../generated/prisma/client.js';
import { CreatePromptDto } from './dto/create-prompt.dto.js';
import { FindPromptsQueryDto } from './dto/find-prompts-query.dto.js';
import { PromptResponseDto } from './dto/prompt-response.dto.js';
import { UpdatePromptDto } from './dto/update-prompt.dto.js';

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePromptDto): Promise<PromptResponseDto> {
    return this.prisma.prompt.create({
      data: {
        name: dto.name,
        message: dto.message,
        kind: dto.kind ?? JobKind.communication,
      },
    });
  }

  findAll(query: FindPromptsQueryDto): Promise<PromptResponseDto[]> {
    return this.prisma.prompt.findMany({
      where: { kind: query.kind },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdatePromptDto): Promise<PromptResponseDto> {
    try {
      return await this.prisma.prompt.update({
        where: { id },
        data: {
          name: dto.name,
          message: dto.message,
          kind: dto.kind,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Prompt "${id}" not found`);
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.prompt.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Prompt "${id}" not found`);
      }

      throw error;
    }
  }
}
