import { ParseArrayPipe, ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { LlmUsageSummaryQueryDto } from './dto/llm-usage-filter.dto.js';
import { LlmUsageItemDto } from './dto/llm-usage-item.dto.js';
import { LlmUsageService } from './llm-usage.service.js';

const SAMPLE = {
  reportKey: '2026-10-11|NEW_CRM_PPLEN_Email_Generation|claude-haiku-5-5',
  date: '2026-10-11',
  flow: 'NEW_CRM_PPLEN_Email_Generation',
  llm_mod: 'claude-haiku-5-5',
  requests: 5,
  inputTokens: 86226,
  outputTokens: 9031,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0.1 + 0.2,
};

function makeService() {
  const upsert = vi.fn((args: unknown) => args);
  const queryRaw = vi.fn().mockResolvedValue([]);
  const prisma = {
    llmUsageDaily: { upsert },
    $transaction: vi.fn((ops: unknown[]) => Promise.resolve(ops)),
    $queryRaw: queryRaw,
  };
  return { service: new LlmUsageService(prisma as never), upsert, queryRaw };
}

async function parse<T extends object>(cls: new () => T, plain: object): Promise<T> {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  return pipe.transform(plain, { type: 'query', metatype: cls }) as Promise<T>;
}

describe('POST /llm-usage payload', () => {
  const pipe = new ParseArrayPipe({ items: LlmUsageItemDto, whitelist: true, forbidNonWhitelisted: true });

  it('приймає реальний рядок n8n разом з reportKey і довгим float у cost', async () => {
    await expect(pipe.transform([SAMPLE], { type: 'body' })).resolves.toHaveLength(1);
  });

  it('відхиляє неіснуючу структуру', async () => {
    await expect(pipe.transform([{ ...SAMPLE, requests: -1 }], { type: 'body' })).rejects.toThrow();
    await expect(pipe.transform([{ ...SAMPLE, extra: 1 }], { type: 'body' })).rejects.toThrow();
  });
});

describe('LlmUsageService.upsertMany', () => {
  it('перезаписує рядок по (date, flow, llmMod), виводить type і округлює cost до 8 знаків', async () => {
    const { service, upsert } = makeService();
    const [item] = await new ParseArrayPipe({ items: LlmUsageItemDto }).transform([SAMPLE], { type: 'body' });

    await expect(service.upsertMany([item as LlmUsageItemDto])).resolves.toEqual({ upserted: 1 });

    const args = upsert.mock.calls[0]![0] as {
      where: { date_flow_llmMod: { flow: string; llmMod: string } };
      update: { type: string; cost: { toString(): string }; inputTokens: bigint };
    };
    expect(args.where.date_flow_llmMod).toMatchObject({ flow: SAMPLE.flow, llmMod: SAMPLE.llm_mod });
    expect(args.update.type).toBe('new_email_generation');
    expect(args.update.inputTokens).toBe(86226n);
    expect(args.update.cost.toString()).toBe('0.3');
  });

  it('відхиляє неіснуючу календарну дату', async () => {
    const { service } = makeService();
    await expect(service.upsertMany([{ ...SAMPLE, date: '2026-02-31' } as LlmUsageItemDto])).rejects.toThrow(
      'not a valid calendar date',
    );
  });
});

describe('LlmUsageService.summarize', () => {
  async function sqlFor(query: Record<string, unknown>) {
    const { service, queryRaw } = makeService();
    await service.summarize(await parse(LlmUsageSummaryQueryDto, query));
    // $queryRaw викликається як tagged template: (strings, ...values).
    // Prisma.sql сам розгортає вкладені Sql-фрагменти, як це робить Prisma.
    const [strings, ...params] = queryRaw.mock.calls[0]! as [TemplateStringsArray, ...unknown[]];
    const sql = Prisma.sql(strings, ...params);
    return { text: sql.sql.replace(/\s+/g, ' '), values: sql.values };
  }

  it('quarter + groupBy: date_trunc, групування за ординалами, значення йдуть параметрами', async () => {
    const { text, values } = await sqlFor({ granularity: 'quarter', groupBy: 'type,llmMod', from: '2026-01-01', llmMod: 'a,b' });
    expect(text).toContain("date_trunc('quarter', \"date\")");
    expect(text).toContain('GROUP BY 1, 2, 3');
    expect(text).toContain('ORDER BY 1, 2, 3');
    expect(text).toContain('"llm_mod" IN (');
    expect(values).toEqual(['2026-01-01', 'a', 'b']);
  });

  it('total без групування — без GROUP BY, period = NULL', async () => {
    const { text } = await sqlFor({ granularity: 'total' });
    expect(text).toContain('NULL::text AS "period"');
    expect(text).not.toContain('GROUP BY');
  });

  it('day за замовчуванням, а date = from = to', async () => {
    const { text, values } = await sqlFor({ date: '2026-10-11' });
    expect(text).toContain("to_char(\"date\", 'YYYY-MM-DD') AS \"period\"");
    expect(values).toEqual(['2026-10-11', '2026-10-11']);
  });

  it('відхиляє date разом з from/to та from > to', async () => {
    const { service } = makeService();
    await expect(service.summarize(await parse(LlmUsageSummaryQueryDto, { date: '2026-10-11', from: '2026-10-01' }))).rejects.toThrow();
    await expect(service.summarize(await parse(LlmUsageSummaryQueryDto, { from: '2026-10-11', to: '2026-10-01' }))).rejects.toThrow();
  });

  it('не пускає невідомі granularity/groupBy (захист SQL)', async () => {
    await expect(parse(LlmUsageSummaryQueryDto, { granularity: 'year' })).rejects.toThrow();
    await expect(parse(LlmUsageSummaryQueryDto, { groupBy: 'cost;drop table x' })).rejects.toThrow();
  });
});
