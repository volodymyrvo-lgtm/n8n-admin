import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateJobErrorDto } from './dto/create-job-error.dto.js';
import { FindJobErrorsQueryDto } from './dto/find-job-errors-query.dto.js';
import { JobErrorResponseDto, PaginatedJobErrorsResponseDto } from './dto/job-error-response.dto.js';

/**
 * Помилки виконання джоб живуть в окремій таблиці job_errors і лише
 * прив'язані до джоби через jobId — в об'єкт джоби вони не потрапляють.
 */
@Injectable()
export class JobErrorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Кожен виклик додає новий запис: одна джоба може мати кілька помилок. */
  async create(dto: CreateJobErrorDto): Promise<JobErrorResponseDto> {
    try {
      return await this.prisma.jobError.create({
        data: {
          jobId: dto.jobId,
          // JSON-поле в Prisma вимагає власний рекурсивний тип, а не unknown.
          error: dto.error as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // P2003 — порушення FK: джоби з таким id немає.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException(`Job "${dto.jobId}" not found`);
      }

      throw error;
    }
  }

  /** Помилки всіх джоб (або однієї, якщо передано jobId), найновіші першими. */
  async findAll(query: FindJobErrorsQueryDto): Promise<PaginatedJobErrorsResponseDto> {
    const where: Prisma.JobErrorWhereInput = { jobId: query.jobId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobError.findMany({
        where,
        // id — другий ключ, щоб порядок не "плавав" між сторінками при однаковому createdAt.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.jobError.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }
}
