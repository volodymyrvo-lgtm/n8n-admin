import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JobKind } from '../generated/prisma/client.js';
import { CreateRuleDto } from './dto/create-rule.dto.js';
import { FindRulesQueryDto } from './dto/find-rules-query.dto.js';
import { UpdateRuleDto } from './dto/update-rule.dto.js';
import { RulesService } from './rules.service.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function parse<T extends object>(cls: new () => T, plain: object, type: 'body' | 'query' = 'body'): Promise<T> {
  return pipe.transform(plain, { type, metatype: cls }) as Promise<T>;
}

const VALID_RULE = { ruleName: 'Tone', ruleSet: { a: 1 }, setType: ['email'] };

function makeService() {
  const create = vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const update = vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const findMany = vi.fn().mockResolvedValue([]);
  const service = new RulesService({ rule: { create, update, findMany } } as never);
  return { service, create, update, findMany };
}

describe('Rules kind', () => {
  it('вид правила задає роут: сервіс зберігає переданий kind', async () => {
    const { service, create } = makeService();
    await service.create(await parse(CreateRuleDto, VALID_RULE), JobKind.communication);
    await service.create(await parse(CreateRuleDto, VALID_RULE), JobKind.seo);
    expect((create.mock.calls[0]![0] as { data: { kind: JobKind } }).data.kind).toBe(JobKind.communication);
    expect((create.mock.calls[1]![0] as { data: { kind: JobKind } }).data.kind).toBe(JobKind.seo);
  });

  it('клієнт не може передати kind ні при створенні, ні при оновленні', async () => {
    await expect(parse(CreateRuleDto, { ...VALID_RULE, kind: 'seo' })).rejects.toThrow();
    await expect(parse(UpdateRuleDto, { kind: 'seo' })).rejects.toThrow();
  });

  it('список: за замовчуванням communication, kind=seo фільтрує SEO-правила', async () => {
    const { service, findMany } = makeService();
    await service.findAll(await parse(FindRulesQueryDto, {}, 'query'));
    await service.findAll(await parse(FindRulesQueryDto, { kind: 'seo' }, 'query'));
    expect((findMany.mock.calls[0]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.communication);
    expect((findMany.mock.calls[1]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.seo);
    await expect(parse(FindRulesQueryDto, { kind: 'x' }, 'query')).rejects.toThrow();
  });

  it('PATCH не змінює kind', async () => {
    const { service, update } = makeService();
    await service.update('11111111-1111-1111-1111-111111111111', await parse(UpdateRuleDto, { ruleName: 'New name' }));
    expect((update.mock.calls[0]![0] as { data: Record<string, unknown> }).data).not.toHaveProperty('kind');
  });
});
