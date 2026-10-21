import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { CreateJobErrorDto } from './dto/create-job-error.dto.js';
import { FindJobErrorsQueryDto } from './dto/find-job-errors-query.dto.js';
import { JobErrorsService } from './job-errors.service.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function parse<T extends object>(cls: new () => T, plain: object, type: 'body' | 'query' = 'body'): Promise<T> {
  return pipe.transform(plain, { type, metatype: cls }) as Promise<T>;
}

const JOB_ID = '11111111-1111-4111-8111-111111111111';

function makeService(createImpl?: () => Promise<unknown>) {
  const create = vi.fn(
    createImpl ?? ((args?: unknown) => Promise.resolve({ id: 'err-1', createdAt: new Date(), ...(args as { data: object }).data })),
  );
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const prisma = {
    jobError: { create, findMany, count },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return { service: new JobErrorsService(prisma as never), create, findMany, count };
}

describe('POST /job-errors — CreateJobErrorDto', () => {
  it.each([
    ["об'єкт", { message: 'boom', node: 'HTTP Request', code: 500 }],
    ['масив', [{ a: 1 }, { b: 2 }]],
    ['рядок', 'Something failed'],
    ['число', 42],
  ])('приймає error як %s', async (_label, error) => {
    await expect(parse(CreateJobErrorDto, { jobId: JOB_ID, error })).resolves.toMatchObject({ jobId: JOB_ID, error });
  });

  it('відхиляє відсутні/некоректні jobId і error', async () => {
    await expect(parse(CreateJobErrorDto, { error: 'x' })).rejects.toThrow();
    await expect(parse(CreateJobErrorDto, { jobId: 'not-a-uuid', error: 'x' })).rejects.toThrow();
    await expect(parse(CreateJobErrorDto, { jobId: JOB_ID })).rejects.toThrow();
    await expect(parse(CreateJobErrorDto, { jobId: JOB_ID, error: null })).rejects.toThrow();
  });

  it('відхиляє зайві поля', async () => {
    await expect(parse(CreateJobErrorDto, { jobId: JOB_ID, error: 'x', extra: 1 })).rejects.toThrow();
  });
});

describe('JobErrorsService.create', () => {
  it('створює запис з jobId і довільним JSON', async () => {
    const { service, create } = makeService();
    const payload = { message: 'boom', stack: ['a', 'b'] };

    const result = await service.create(await parse(CreateJobErrorDto, { jobId: JOB_ID, error: payload }));

    expect(create).toHaveBeenCalledWith({ data: { jobId: JOB_ID, error: payload } });
    expect(result).toMatchObject({ id: 'err-1', jobId: JOB_ID, error: payload });
  });

  it('повертає 404, якщо джоби з таким id немає (порушення FK)', async () => {
    const fkError = new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' });
    const { service } = makeService(() => Promise.reject(fkError));

    await expect(service.create(await parse(CreateJobErrorDto, { jobId: JOB_ID, error: 'x' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('GET /job-errors — JobErrorsService.findAll', () => {
  it('без фільтра: всі помилки, найновіші першими, пагінація за замовчуванням', async () => {
    const { service, findMany } = makeService();
    const result = await service.findAll(await parse(FindJobErrorsQueryDto, {}, 'query'));

    expect(findMany).toHaveBeenCalledWith({
      where: { jobId: undefined },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
    });
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 50 });
  });

  it('?jobId фільтрує помилки однієї джоби, page/limit рахують skip', async () => {
    const { service, findMany, count } = makeService();
    await service.findAll(await parse(FindJobErrorsQueryDto, { jobId: JOB_ID, page: '3', limit: '10' }, 'query'));

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { jobId: JOB_ID }, skip: 20, take: 10 }));
    expect(count).toHaveBeenCalledWith({ where: { jobId: JOB_ID } });
  });

  it('відхиляє некоректні query-параметри', async () => {
    await expect(parse(FindJobErrorsQueryDto, { jobId: 'x' }, 'query')).rejects.toThrow();
    await expect(parse(FindJobErrorsQueryDto, { limit: '1000' }, 'query')).rejects.toThrow();
    await expect(parse(FindJobErrorsQueryDto, { page: '0' }, 'query')).rejects.toThrow();
  });
});
