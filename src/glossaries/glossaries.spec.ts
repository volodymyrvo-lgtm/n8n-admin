import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JobKind } from '../generated/prisma/client.js';
import { CreateGlossaryDto } from './dto/create-glossary.dto.js';
import { FindGlossariesQueryDto } from './dto/find-glossaries-query.dto.js';
import { UpdateGlossaryDto } from './dto/update-glossary.dto.js';
import { GlossariesService } from './glossaries.service.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function parse<T extends object>(cls: new () => T, plain: object, type: 'body' | 'query' = 'body'): Promise<T> {
  return pipe.transform(plain, { type, metatype: cls }) as Promise<T>;
}

const VALID = { glossaryName: 'Blog terms', allGlossRules: { entries: [{ id: 'e1', english_term: 'bonus' }] } };

function makeService() {
  const create = vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const update = vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const findMany = vi.fn().mockResolvedValue([]);
  const findUnique = vi.fn().mockResolvedValue({ id: 'g1', allGlossRules: { entries: [{ id: 'e1', english_term: 'x' }] } });
  const service = new GlossariesService({ glossary: { create, update, findMany, findUnique } } as never);
  return { service, create, update, findMany };
}

describe('Glossaries kind', () => {
  it('створення без kind дає communication (старі клієнти не ламаються)', async () => {
    const { service, create } = makeService();
    await service.create(await parse(CreateGlossaryDto, VALID));
    expect((create.mock.calls[0]![0] as { data: { kind: JobKind } }).data.kind).toBe(JobKind.communication);
  });

  it('створення з kind=blog_ai зберігає blog_ai; невідомий kind — помилка', async () => {
    const { service, create } = makeService();
    await service.create(await parse(CreateGlossaryDto, { ...VALID, kind: 'blog_ai' }));
    expect((create.mock.calls[0]![0] as { data: { kind: JobKind } }).data.kind).toBe(JobKind.blog_ai);
    await expect(parse(CreateGlossaryDto, { ...VALID, kind: 'nope' })).rejects.toThrow();
  });

  it('PATCH: kind необов\'язковий, без нього не чіпається, з ним змінюється', async () => {
    const { service, update } = makeService();
    await service.update('g1', await parse(UpdateGlossaryDto, { glossaryName: 'New name' }));
    await service.update('g1', await parse(UpdateGlossaryDto, { kind: 'blog_ai' }));
    expect((update.mock.calls[0]![0] as { data: { kind?: JobKind } }).data.kind).toBeUndefined();
    expect((update.mock.calls[1]![0] as { data: { kind?: JobKind } }).data.kind).toBe(JobKind.blog_ai);
  });

  it('список: за замовчуванням communication, kind=blog_ai фільтрує глосарії блог-асистента', async () => {
    const { service, findMany } = makeService();
    await service.findAll(await parse(FindGlossariesQueryDto, {}, 'query'));
    await service.findAll(await parse(FindGlossariesQueryDto, { kind: 'blog_ai' }, 'query'));
    expect((findMany.mock.calls[0]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.communication);
    expect((findMany.mock.calls[1]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.blog_ai);
    await expect(parse(FindGlossariesQueryDto, { kind: 'x' }, 'query')).rejects.toThrow();
  });
});
