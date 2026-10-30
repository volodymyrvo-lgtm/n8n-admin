import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUpdatedEmailDto } from './dto/create-updated-email.dto.js';
import type { FindUpdatedEmailsQueryDto } from './dto/find-updated-emails-query.dto.js';
import type { PaginatedUpdatedEmailsResponseDto, UpdatedEmailResponseDto } from './dto/updated-email-response.dto.js';

@Injectable()
export class UpdatedEmailsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Кожен виклик додає новий запис: один лист може мати кілька версій. */
  create(dto: CreateUpdatedEmailDto): Promise<UpdatedEmailResponseDto> {
    return this.prisma.updatedEmail.create({ data: { emailId: dto.emailId, body: dto.body } });
  }

  /**
   * Список із пагінацією, найновіші першими. Без body: HTML може важити
   * мегабайти, тому в списку лише метадані, а сам лист віддає findOne.
   */
  async findAll(query: FindUpdatedEmailsQueryDto): Promise<PaginatedUpdatedEmailsResponseDto> {
    const where: Prisma.UpdatedEmailWhereInput = {
      emailId: query.emailId,
      ...(query.search ? { AND: [{ emailId: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.updatedEmail.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: { id: true, emailId: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.updatedEmail.count({ where }),
    ]);

    return {
      items: rows,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Один лист разом з HTML; 404, якщо id не існує. */
  async findOne(id: string): Promise<UpdatedEmailResponseDto> {
    const email = await this.prisma.updatedEmail.findUnique({ where: { id } });
    if (!email) {
      throw new NotFoundException(`Updated email "${id}" not found`);
    }
    return email;
  }
}
