import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsGateway } from './jobs.gateway.js';
import { JobKind, JobStatus, Prisma, TaskStatus } from '../generated/prisma/client.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { CreateDesignJobDto } from './dto/create-design-job.dto.js';
import { CreateSeoJobDto } from './dto/create-seo-job.dto.js';
import { FindJobsQueryDto } from './dto/find-jobs-query.dto.js';
import { JobResponseDto } from './dto/job-response.dto.js';
import { PaginatedJobsResponseDto } from './dto/paginated-jobs-response.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { isHtmlUpdateTaskStatus } from './html-update-task-status.js';

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

  /** Одна джоба разом із правилами; NotFoundException, якщо id не існує. */
  async findOne(id: string): Promise<JobResponseDto> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: JOB_WITH_RULES_INCLUDE,
    });

    if (!job) {
      throw new NotFoundException(`Job "${id}" not found`);
    }

    return JobsService.toResponseDto(job);
  }

  /**
   * Пагінований список джоб згідно з ТЗ фронта: page/limit (1-based),
   * опціональні фільтри по messageType ("jobType" у query — так назвав
   * фронт, у нас це messageType) і runnedById. total — кількість джоб, що
   * відповідають ФІЛЬТРАМ, а не загальна кількість у таблиці.
   */
  async findAll(query: FindJobsQueryDto): Promise<PaginatedJobsResponseDto> {
    const where: Prisma.JobWhereInput = {
      kind: query.kind,
      messageType: query.jobType && query.jobType.length > 0 ? { in: query.jobType } : undefined,
      runnedById: query.runnedById,
    };

    // $transaction — щоб items і total рахувались проти одного й того ж
    // знімку даних, а не могли розійтись через паралельний запис між двома
    // окремими запитами.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        include: JOB_WITH_RULES_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      items: items.map(JobsService.toResponseDto),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async create(dto: CreateJobDto, createdByUserId: string): Promise<JobResponseDto> {
    if (isHtmlUpdateTaskStatus(dto.taskStatus)) {
      return this.createHtmlUpdate(dto, createdByUserId);
    }
    if (dto.isBannerUpdate === true) {
      throw new BadRequestException('isBannerUpdate is allowed only for taskStatus "welcome_email_html_update" or "system_email_html_update"');
    }

    // sm/llm/ruleIds обов'язкові для всіх taskStatus, КРІМ 'update' — там
    // фронт ховає ці поля і завжди шле їх порожніми (sm: '', llm: '',
    // ruleIds: []). DTO це вже пропускає (лише базові @IsString()/@IsArray()),
    // тож реальну вимогу перевіряємо тут, де видно обидва поля одразу.
    JobsService.assertRequiredFieldsForTaskStatus(dto);

    // sm у БД типізований як uuid (не text) — порожній рядок Postgres не
    // прийме ("invalid input syntax for type uuid"), тож нормалізуємо
    // порожнє значення в null перед записом. llm технічно text, але для
    // узгодженості з "null = значення не задане" робимо так само.
    const sm = dto.sm.trim() === '' ? null : dto.sm;
    const llm = dto.llm.trim() === '' ? null : dto.llm;

    await this.assertRulesMatchKind(dto.ruleIds, JobKind.communication);

    try {
      const job = await this.prisma.job.create({
        data: {
          kind: JobKind.communication,
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
          sm,
          glossaryId: dto.glossaryId,
          llm,
          // runDate НЕ приймаємо з фронта — виставляємо на бекенді як
          // момент створення джоби. n8n і надалі може змінити його пізніше
          // через PATCH /jobs/:id (UpdateJobDto) — це лишається без змін.
          runDate: new Date(),
          // spend навмисно не передаємо тут — БД-дефолт ('{}') сам
          // проставить порожній об'єкт, який далі поповнює n8n через PATCH.
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

  /**
   * Джоба оновлення HTML листа (taskStatus welcome_email_html_update /
   * system_email_html_update): береться лише taskDescription та isBannerUpdate
   * (за замовчуванням false). steps починаються порожнім об'єктом (далі їх
   * наповнює n8n через PATCH); jobType, messageType, board, sm, llm лишаються
   * null, правил немає. Решту переданих полів ігноруємо.
   */
  private async createHtmlUpdate(dto: CreateJobDto, createdByUserId: string): Promise<JobResponseDto> {
    const job = await this.prisma.job.create({
      data: {
        kind: JobKind.communication,
        steps: {},
        taskStatus: dto.taskStatus,
        taskDescription: dto.taskDescription,
        isBannerUpdate: dto.isBannerUpdate ?? false,
        runnedById: createdByUserId,
        runDate: new Date(),
      },
      include: JOB_WITH_RULES_INCLUDE,
    });

    return JobsService.toResponseDto(job);
  }

  /**
   * Design-джоба: клієнт передає лише taskDescription. kind, runnedById і
   * runDate виставляє сервер, steps починаються порожнім об'єктом (далі їх
   * наповнює n8n через PATCH), llm лишається null. Правил (ruleIds) вона не
   * приймає.
   */
  async createDesign(dto: CreateDesignJobDto, createdByUserId: string): Promise<JobResponseDto> {
    const job = await this.prisma.job.create({
      data: {
        kind: JobKind.design,
        steps: {},
        taskDescription: dto.taskDescription,
        runnedById: createdByUserId,
        runDate: new Date(),
      },
      include: JOB_WITH_RULES_INCLUDE,
    });

    return JobsService.toResponseDto(job);
  }

  /**
   * SEO-джоба: kind, runnedById і runDate виставляє сервер. Поля communication
   * (board, messageType, ...) тут не задаються — лишаються null. ruleIds
   * приймаються, але лише id SEO-правил.
   */
  async createSeo(dto: CreateSeoJobDto, createdByUserId: string): Promise<JobResponseDto> {
    await this.assertRulesMatchKind(dto.ruleIds, JobKind.seo);

    try {
      const job = await this.prisma.job.create({
        data: {
          kind: JobKind.seo,
          steps: dto.steps as Prisma.InputJsonValue,
          language: dto.language.toUpperCase(),
          llm: dto.llm,
          prompt: dto.prompt,
          pageTask: dto.pageTask,
          runnedById: createdByUserId,
          runDate: new Date(),
          jobRules: { create: dto.ruleIds.map((ruleId) => ({ ruleId })) },
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
    // spend мерджиться по ключах, а не перезаписується цілком — той самий
    // клас багу, що стер entries в glossaries 22.09.2026, тут би тихо
    // занулював усі попередні витрати щоразу, як n8n дописує ще один
    // ключ. Тому спершу читаємо поточний spend і домерджовуємо в нього
    // лише передані ключі.
    let spend: Prisma.InputJsonValue | undefined;

    if (dto.spend !== undefined) {
      JobsService.assertNumericRecord(dto.spend);

      const current = await this.prisma.job.findUnique({ where: { id }, select: { spend: true } });
      if (!current) {
        throw new NotFoundException(`Job "${id}" not found`);
      }

      const currentSpend = JobsService.isNumericRecord(current.spend) ? current.spend : {};
      spend = { ...currentSpend, ...dto.spend } as Prisma.InputJsonValue;
    }

    // status: 'failed' — крім самого статусу джоби, позначаємо failed і той
    // крок, що зараз pending.
    let steps = dto.steps as Prisma.InputJsonValue | undefined;

    if (dto.status === JobStatus.failed) {
      const current = await this.prisma.job.findUnique({ where: { id }, select: { steps: true } });
      if (!current) {
        throw new NotFoundException(`Job "${id}" not found`);
      }

      // Якщо разом зі status прийшли й steps — працюємо з ними, інакше з БД.
      steps = JobsService.failPendingStep(dto.steps ?? current.steps);
    }

    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: {
          steps,
          status: dto.status,
          // runDate тепер виставляється лише на створенні (POST /jobs) і
          // більше не оновлюється через цей ендпоінт. dto.runDate навмисно
          // ігнорується — поле лишили в UpdateJobDto заради сумісності,
          // щоб n8n, який і далі може його присилати, не отримував 400
          // через forbidNonWhitelisted, але воно ніяк не впливає на запис.
          spend,
          tableUrl: dto.tableUrl,
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

  /**
   * Усі ruleIds мають існувати й мати вказаний kind: communication-джоба може
   * посилатись лише на communication-правила, SEO-джоба — лише на SEO. Вид
   * правила задає роут, яким його створили, тож клієнт не може "підсунути"
   * правило чужого виду.
   */
  private async assertRulesMatchKind(ruleIds: string[], kind: JobKind): Promise<void> {
    if (ruleIds.length === 0) {
      return;
    }

    const rules = await this.prisma.rule.findMany({
      where: { id: { in: ruleIds } },
      select: { id: true, kind: true },
    });

    if (rules.length !== new Set(ruleIds).size) {
      throw new BadRequestException('One or more ruleIds do not exist');
    }

    if (rules.some((rule) => rule.kind !== kind)) {
      throw new BadRequestException(`ruleIds must reference rules of kind "${kind}"`);
    }
  }

  /**
   * Для будь-якого taskStatus, крім 'update', sm/llm/ruleIds лишаються
   * обов'язковими (як і до появи update-джоб) — 'update' навмисно
   * виключено, бо фронт для нього ці поля ховає й завжди шле порожніми.
   */
  private static assertRequiredFieldsForTaskStatus(dto: CreateJobDto): void {
    if (dto.taskStatus === TaskStatus.update) {
      return;
    }

    if (!isUUID(dto.sm)) {
      throw new BadRequestException('sm must be a UUID unless taskStatus is "update"');
    }

    if (dto.llm.trim().length === 0) {
      throw new BadRequestException('llm must not be empty unless taskStatus is "update"');
    }

    if (dto.ruleIds.length === 0) {
      throw new BadRequestException('ruleIds must not be empty unless taskStatus is "update"');
    }
  }

  /**
   * Повертає копію steps, де ПЕРШИЙ крок зі status === 'pending' (кроки
   * виконуються послідовно, тож pending зазвичай один) переведено в 'failed'.
   * Якщо pending-кроку немає — steps повертається без змін (не помилка:
   * n8n у error-хендлері не повинен отримувати 400).
   */
  private static failPendingStep(steps: unknown): Prisma.InputJsonValue {
    if (typeof steps !== 'object' || steps === null || Array.isArray(steps)) {
      return steps as Prisma.InputJsonValue;
    }

    const entries = Object.entries(steps as Record<string, unknown>);
    const pendingKey = entries.find(
      ([, step]) => typeof step === 'object' && step !== null && (step as { status?: unknown }).status === 'pending',
    )?.[0];

    if (pendingKey === undefined) {
      return steps as Prisma.InputJsonValue;
    }

    return {
      ...(steps as Record<string, unknown>),
      [pendingKey]: { ...(steps as Record<string, Record<string, unknown>>)[pendingKey], status: 'failed' },
    } as Prisma.InputJsonValue;
  }

  /** spend у БД має бути звичайним об'єктом {рядок: число} — перевіряємо перед мерджем. */
  private static isNumericRecord(value: unknown): value is Record<string, number> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'number' && Number.isFinite(v));
  }

  /** Перевіряє, що всі значення в тілі PATCH-запиту — скінченні числа, перш ніж мерджити їх у spend. */
  private static assertNumericRecord(value: Record<string, unknown>): void {
    for (const [key, v] of Object.entries(value)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new BadRequestException(`spend."${key}" must be a finite number`);
      }
    }
  }

  private static toResponseDto(job: JobWithRules): JobResponseDto {
    const { jobRules, ...rest } = job;
    return {
      ...rest,
      // Prisma типізує JSON-поле spend як JsonValue (union включає null),
      // хоча в БД воно NOT NULL DEFAULT '{}' — тут просто звужуємо тип
      // під DTO, як і з allGlossRules в glossaries.
      spend: rest.spend as Record<string, number>,
      ruleIds: jobRules.map((jobRule) => jobRule.ruleId),
    };
  }
}
