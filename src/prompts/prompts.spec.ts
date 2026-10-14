import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JobKind } from '../generated/prisma/client.js';
import { CreatePromptDto } from './dto/create-prompt.dto.js';
import { FindPromptsQueryDto } from './dto/find-prompts-query.dto.js';
import { UpdatePromptDto } from './dto/update-prompt.dto.js';
import { PromptsService } from './prompts.service.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function parse<T extends object>(cls: new () => T, plain: object, type: 'body' | 'query' = 'body'): Promise<T> {
  return pipe.transform(plain, { type, metatype: cls }) as Promise<T>;
}

function makeService() {
  const create = vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const update = vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data));
  const findMany = vi.fn().mockResolvedValue([]);
  const service = new PromptsService({ prompt: { create, update, findMany } } as never);
  return { service, create, update, findMany };
}

describe('Prompts kind', () => {
  it('створення без kind дає communication (старі клієнти не ламаються)', async () => {
    const { service, create } = makeService();
    await service.create(await parse(CreatePromptDto, { name: 'p', message: 'm' }));
    expect((create.mock.calls[0]![0] as { data: { kind: JobKind } }).data.kind).toBe(JobKind.communication);
  });

  it('створення з kind=seo зберігає seo; невідомий kind — помилка', async () => {
    const { service, create } = makeService();
    await service.create(await parse(CreatePromptDto, { name: 'p', message: 'm', kind: 'seo' }));
    expect((create.mock.calls[0]![0] as { data: { kind: JobKind } }).data.kind).toBe(JobKind.seo);
    await expect(parse(CreatePromptDto, { name: 'p', message: 'm', kind: 'other' })).rejects.toThrow();
  });

  it('список: за замовчуванням communication, kind=seo фільтрує SEO-промпти', async () => {
    const { service, findMany } = makeService();
    await service.findAll(await parse(FindPromptsQueryDto, {}, 'query'));
    await service.findAll(await parse(FindPromptsQueryDto, { kind: 'seo' }, 'query'));
    expect((findMany.mock.calls[0]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.communication);
    expect((findMany.mock.calls[1]![0] as { where: { kind: JobKind } }).where.kind).toBe(JobKind.seo);
    await expect(parse(FindPromptsQueryDto, { kind: 'x' }, 'query')).rejects.toThrow();
  });

  it('PATCH: kind необов\'язковий, але валідний, якщо переданий', async () => {
    const { service, update } = makeService();
    await service.update('11111111-1111-1111-1111-111111111111', await parse(UpdatePromptDto, { name: 'new' }));
    expect((update.mock.calls[0]![0] as { data: { kind?: JobKind } }).data.kind).toBeUndefined();
    await expect(parse(UpdatePromptDto, { kind: 'bad' })).rejects.toThrow();
  });
});
