import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsGateway } from './jobs.gateway.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobResponseDto } from './dto/job-response.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';

const JOB_WITH_RULES_INCLUDE = {
  jobRules: { select: { ruleId: true } },
} satisfies Prisma.JobInclude;

type JobWithRules = Prisma.JobGetPayload<{ include: typeof JOB_WITH_RULES_INCLUDE }>;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsGateway: JobsGateway,
  ) {}

  async findAll(): Promise<JobResponseDto[]> {
    const jobs = await this.prisma.job.findMany({
      include: JOB_WITH_RULES_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map(JobsService.toResponseDto);
  }

  async create(dto: CreateJobDto, createdByUserId: string): Promise<JobResponseDto> {
    try {
      const job = await this.prisma.job.create({
        data: {
          // Record<string, unknown> проходить валідацію class-validator як
          // "непорожній об'єкт", але Prisma для JSON-полів вимагає власний
          // рекурсивний тип, а не `unknown` — тому явний каст саме тут.
          steps: dto.steps as Prisma.InputJsonValue,
          jobType: dto.jobType,
          taskStatus: dto.taskStatus,
          messageType: dto.messageType,
          board: dto.board,
          taskDescription: dto.taskDescription,
          // Юзер, який створив джобу — той, хто зараз залогінений (з JWT),
          // а не те, що прийшло в тілі запиту.
          runnedById: createdByUserId,
          jobRules: {
            create: dto.ruleIds.map((ruleId) => ({ ruleId })),
          },
        },
        include: JOB_WITH_RULES_INCLUDE,
      });

      return JobsService.toResponseDto(job);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('One or more ruleIds do not exist');
      }

      throw error;
    }
  }

  /** Оновлення прогресу виконання джоби — викликає n8n через API-ключ. */
  async update(id: string, dto: UpdateJobDto): Promise<JobResponseDto> {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          steps: dto.steps as Prisma.InputJsonValue | undefined,
          status: dto.status,
          // undefined тут означає "поле не передали" — Prisma просто
          // пропустить його й не чіпатиме значення в базі.
          runDate: dto.runDate === undefined ? undefined : new Date(dto.runDate),
        },
        include: JOB_WITH_RULES_INCLUDE,
      });

      const response = JobsService.toResponseDto(job);
      // Саме тут, а не в create() — фронт має отримувати живі апдейти
      // прогресу виконання (той самий кейс, що просив користувач: n8n
      // оновлює джобу через PATCH, і всі підключені клієнти бачать це одразу).
      this.jobsGateway.emitJobUpdated(response);

      return response;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Job "${id}" not found`);
      }

      throw error;
    }
  }

  /** Видаляє геть усі джоби. Викликається окремим ендпоінтом, тільки для admin. */
  async removeAll(): Promise<{ deletedCount: number }> {
    const { count } = await this.prisma.job.deleteMany({});
    return { deletedCount: count };
  }

  private static toResponseDto(job: JobWithRules): JobResponseDto {
    const { jobRules, ...rest } = job;
    return { ...rest, ruleIds: jobRules.map((jobRule) => jobRule.ruleId) };
  }
}
