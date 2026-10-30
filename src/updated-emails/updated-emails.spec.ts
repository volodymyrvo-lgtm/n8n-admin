import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CreateUpdatedEmailDto, MAX_EMAIL_BODY_LENGTH } from './dto/create-updated-email.dto.js';
import { FindUpdatedEmailsQueryDto } from './dto/find-updated-emails-query.dto.js';
import { UpdatedEmailsService } from './updated-emails.service.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = (plain: object) => pipe.transform(plain, { type: 'body', metatype: CreateUpdatedEmailDto }) as Promise<CreateUpdatedEmailDto>;

const HTML = '<!DOCTYPE html>\n<html>\n  <body style="margin:0">\n    <h1>Привіт, {{ first_name }}!</h1>\n  </body>\n</html>\n';

describe('POST /updated-emails — CreateUpdatedEmailDto', () => {
  it('приймає emailId і HTML; HTML лишається без змін (пробіли, переноси)', async () => {
    const dto = await parse({ emailId: '  welcome_1 ', body: HTML });
    expect(dto.emailId).toBe('welcome_1');
    expect(dto.body).toBe(HTML);
  });

  it('вимагає обидва поля і відхиляє порожні', async () => {
    await expect(parse({ body: HTML })).rejects.toThrow();
    await expect(parse({ emailId: 'x' })).rejects.toThrow();
    await expect(parse({ emailId: '   ', body: HTML })).rejects.toThrow();
    await expect(parse({ emailId: 'x', body: '' })).rejects.toThrow();
  });

  it('відхиляє не-рядки, задовгі значення й зайві поля', async () => {
    await expect(parse({ emailId: 1, body: HTML })).rejects.toThrow();
    await expect(parse({ emailId: 'x', body: { html: HTML } })).rejects.toThrow();
    await expect(parse({ emailId: 'x'.repeat(256), body: HTML })).rejects.toThrow();
    await expect(parse({ emailId: 'x', body: 'a'.repeat(MAX_EMAIL_BODY_LENGTH + 1) })).rejects.toThrow();
    await expect(parse({ emailId: 'x', body: HTML, extra: 1 })).rejects.toThrow();
  });

  it('великий, але допустимий HTML проходить', async () => {
    await expect(parse({ emailId: 'x', body: 'a'.repeat(MAX_EMAIL_BODY_LENGTH) })).resolves.toBeDefined();
  });
});

describe('UpdatedEmailsService.create', () => {
  it('додає запис з emailId і body', async () => {
    const created = { id: 'u1', emailId: 'welcome_1', body: HTML, createdAt: new Date(), updatedAt: new Date() };
    const create = vi.fn().mockResolvedValue(created);
    const service = new UpdatedEmailsService({ updatedEmail: { create } } as never);

    await expect(service.create({ emailId: 'welcome_1', body: HTML })).resolves.toBe(created);
    expect(create).toHaveBeenCalledWith({ data: { emailId: 'welcome_1', body: HTML } });
  });

  it('кожен виклик створює новий запис (без upsert)', async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new UpdatedEmailsService({ updatedEmail: { create } } as never);
    await service.create({ emailId: 'a', body: 'x' });
    await service.create({ emailId: 'a', body: 'y' });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('GET /updated-emails — FindUpdatedEmailsQueryDto', () => {
  const parseQuery = (plain: object) => pipe.transform(plain, { type: 'query', metatype: FindUpdatedEmailsQueryDto }) as Promise<FindUpdatedEmailsQueryDto>;

  it('за замовчуванням page=1, limit=20; рядки з query перетворюються на числа', async () => {
    await expect(parseQuery({})).resolves.toMatchObject({ page: 1, limit: 20 });
    await expect(parseQuery({ page: '3', limit: '50' })).resolves.toMatchObject({ page: 3, limit: 50 });
  });

  it('обрізає пробіли, порожні фільтри вважає незаданими', async () => {
    await expect(parseQuery({ emailId: '  welcome_1 ', search: '  wel ' })).resolves.toMatchObject({ emailId: 'welcome_1', search: 'wel' });
    const empty = await parseQuery({ emailId: '   ', search: '' });
    expect(empty.emailId).toBeUndefined();
    expect(empty.search).toBeUndefined();
  });

  it('відхиляє хибні page/limit і зайві параметри', async () => {
    await expect(parseQuery({ page: '0' })).rejects.toThrow();
    await expect(parseQuery({ limit: '101' })).rejects.toThrow();
    await expect(parseQuery({ limit: 'abc' })).rejects.toThrow();
    await expect(parseQuery({ foo: 1 })).rejects.toThrow();
  });
});

describe('UpdatedEmailsService.findAll / findOne', () => {
  const row = (n: number) => ({ id: `id-${n}`, emailId: `mail_${n}`, createdAt: new Date(), updatedAt: new Date() });

  function make(rows = [row(1), row(2)], total = 7) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const count = vi.fn().mockResolvedValue(total);
    const findUnique = vi.fn();
    const prisma = { updatedEmail: { findMany, count, findUnique }, $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)) };
    return { service: new UpdatedEmailsService(prisma as never), findMany, count, findUnique };
  }

  it('віддає сторінку без body, з total, page і limit; найновіші першими', async () => {
    const { service, findMany } = make();
    const result = await service.findAll({ page: 2, limit: 5 });

    expect(result).toMatchObject({ total: 7, page: 2, limit: 5 });
    expect(result.items).toHaveLength(2);
    const args = findMany.mock.calls[0]![0] as { select: Record<string, boolean>; skip: number; take: number; orderBy: unknown };
    expect(args.select).not.toHaveProperty('body');
    expect(args).toMatchObject({ skip: 5, take: 5, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  });

  it('фільтри: emailId точно, search частково без урахування регістру; count з тим самим where', async () => {
    const { service, findMany, count } = make();
    await service.findAll({ page: 1, limit: 20, emailId: 'welcome_1', search: 'wel' });

    const where = (findMany.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toEqual({ emailId: 'welcome_1', AND: [{ emailId: { contains: 'wel', mode: 'insensitive' } }] });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('без фільтрів where порожній', async () => {
    const { service, findMany } = make();
    await service.findAll({ page: 1, limit: 20 });
    expect((findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where['emailId']).toBeUndefined();
  });

  it('findOne віддає запис разом з body, а для невідомого id кидає 404', async () => {
    const { service, findUnique } = make();
    findUnique.mockResolvedValueOnce({ ...row(1), body: HTML });
    await expect(service.findOne('id-1')).resolves.toMatchObject({ body: HTML });

    findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
