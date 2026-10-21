import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JobKind } from '../generated/prisma/client.js';
import { CreateSeoJobDto } from './dto/create-seo-job.dto.js';
import { FindJobsQueryDto } from './dto/find-jobs-query.dto.js';
import { JobsService } from './jobs.service.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function parse<T extends object>(cls: new () => T, plain: object, type: 'body' | 'query' = 'body'): Promise<T> {
  return pipe.transform(plain, { type, metatype: cls }) as Promise<T>;
}

const RULE_A = '11111111-1111-4111-8111-111111111111';
const RULE_B = '22222222-2222-4222-8222-222222222222';

const VALID_SEO = {
  steps: { step1: { status: 'pending' } },
  language: 'en',
  llm: 'gpt_5_6_sol',
  prompt: 'EN 6eed9bdc-4ed1-4307-9ecf-dc031c34db42',
  pageTask: 'R048 · Кено',
  ruleIds: [RULE_A, RULE_B],
};

function makeService(ruleKind: JobKind = JobKind.seo, existingRuleIds?: string[]) {
  const create = vi.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'job-1',
      spend: {},
      ...args.data,
      // Prisma повертає jobRules уже як масив створених зв'язків.
      jobRules: (args.data['jobRules'] as { create?: Array<{ ruleId: string }> } | undefined)?.create ?? [],
    }),
  );
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const ruleFindMany = vi.fn((args: { where: { id: { in: string[] } } }) =>
    Promise.resolve(
      args.where.id.in.filter((id) => !existingRuleIds || existingRuleIds.includes(id)).map((id) => ({ id, kind: ruleKind })),
    ),
  );
  const prisma = {
    job: { create, findMany, count },
    rule: { findMany: ruleFindMany },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const service = new JobsService(prisma as never, { emitJobUpdated: vi.fn() } as never);
  return { service, create, findMany, count };
}

describe('POST /jobs/seo — CreateSeoJobDto', () => {
  it('приймає чотири основні поля + steps', async () => {
    await expect(parse(CreateSeoJobDto, VALID_SEO)).resolves.toMatchObject({ language: 'en', pageTask: 'R048 · Кено' });
  });

  it('обрізає пробіли навколо рядків', async () => {
    const dto = await parse(CreateSeoJobDto, { ...VALID_SEO, prompt: '  EN abc  ' });
    expect(dto.prompt).toBe('EN abc');
  });

  it.each(['language', 'llm', 'prompt', 'pageTask', 'steps', 'ruleIds'])('відхиляє відсутнє поле %s', async (field) => {
    const { [field]: _omitted, ...rest } = VALID_SEO as Record<string, unknown>;
    await expect(parse(CreateSeoJobDto, rest)).rejects.toThrow();
  });

  it('відхиляє поля communication-джоби і клієнтський kind як зайві', async () => {
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, board: 'ONBOARDING' })).rejects.toThrow();
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, kind: 'communication' })).rejects.toThrow();
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, runDate: '2026-10-14T00:00:00Z' })).rejects.toThrow();
  });

  it('ruleIds: непорожній масив унікальних UUID', async () => {
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, ruleIds: [] })).rejects.toThrow();
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, ruleIds: ['not-a-uuid'] })).rejects.toThrow();
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, ruleIds: [RULE_A, RULE_A] })).rejects.toThrow();
  });

  it('відхиляє некоректний код мови', async () => {
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, language: 'English language' })).rejects.toThrow();
    await expect(parse(CreateSeoJobDto, { ...VALID_SEO, language: 'E' })).rejects.toThrow();
  });
});

describe('JobsService.createSeo', () => {
  it('виставляє kind=seo, runnedById, runDate і нормалізує language', async () => {
    const { service, create } = makeService();
    const dto = await parse(CreateSeoJobDto, VALID_SEO);

    await service.createSeo(dto, 'user-1');

    const { data } = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      kind: JobKind.seo,
      language: 'EN',
      llm: 'gpt_5_6_sol',
      prompt: 'EN 6eed9bdc-4ed1-4307-9ecf-dc031c34db42',
      pageTask: 'R048 · Кено',
      runnedById: 'user-1',
    });
    expect(data['runDate']).toBeInstanceOf(Date);
    expect(data['jobRules']).toEqual({ create: [{ ruleId: RULE_A }, { ruleId: RULE_B }] });
    expect(data).not.toHaveProperty('board');
    expect(data).not.toHaveProperty('messageType');
  });
});

describe('JobsService — вид правил у ruleIds', () => {
  it('SEO-джоба відхиляє communication-правила', async () => {
    const { service, create } = makeService(JobKind.communication);
    await expect(service.createSeo(await parse(CreateSeoJobDto, VALID_SEO), 'user-1')).rejects.toThrow('kind "seo"');
    expect(create).not.toHaveBeenCalled();
  });

  it('SEO-джоба відхиляє неіснуючі правила', async () => {
    const { service, create } = makeService(JobKind.seo, [RULE_A]);
    await expect(service.createSeo(await parse(CreateSeoJobDto, VALID_SEO), 'user-1')).rejects.toThrow('do not exist');
    expect(create).not.toHaveBeenCalled();
  });

  it('communication-джоба відхиляє SEO-правила', async () => {
    const { service, create } = makeService(JobKind.seo);
    const dto = {
      steps: { step1: { status: 'pending' } },
      jobType: 'x',
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'd',
      ruleIds: [RULE_A],
      sm: '33333333-3333-4333-8333-333333333333',
      llm: 'm',
    };
    await expect(service.create(dto as never, 'user-1')).rejects.toThrow('kind "communication"');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('GET /jobs — фільтр kind', () => {
  it('за замовчуванням повертає лише communication', async () => {
    const { service, findMany } = makeService();
    await service.findAll(await parse(FindJobsQueryDto, {}, 'query'));
    expect((findMany.mock.calls[0]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.communication);
  });

  it('kind=seo фільтрує SEO-джоби; невідомий kind — помилка', async () => {
    const { service, findMany } = makeService();
    await service.findAll(await parse(FindJobsQueryDto, { kind: 'seo' }, 'query'));
    expect((findMany.mock.calls[0]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.seo);
    await expect(parse(FindJobsQueryDto, { kind: 'other' }, 'query')).rejects.toThrow();
  });
});

describe('GET /jobs/:id — JobsService.findOne', () => {
  const makeFindOneService = (row: Record<string, unknown> | null) => {
    const findUnique = vi.fn().mockResolvedValue(row);
    const service = new JobsService({ job: { findUnique } } as never, { emitJobUpdated: vi.fn() } as never);
    return { service, findUnique };
  };

  it('повертає джобу разом із правилами, включно з SEO-полями', async () => {
    const { service, findUnique } = makeFindOneService({
      id: 'job-1',
      kind: JobKind.seo,
      spend: {},
      language: 'en',
      pageTask: 'R048',
      jobRules: [{ ruleId: RULE_A }],
    });

    const result = await service.findOne('job-1');

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job-1' } }));
    expect(result).toMatchObject({ id: 'job-1', kind: JobKind.seo, language: 'en', pageTask: 'R048' });
  });

  it('кидає 404, якщо джоби немає', async () => {
    const { service } = makeFindOneService(null);
    await expect(service.findOne('missing')).rejects.toThrow('Job "missing" not found');
  });
});
