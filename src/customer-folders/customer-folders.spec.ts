import { BadGatewayException, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerApiClient, PAGE_SIZE } from './customer-api.client.js';
import { readCustomerApiConfig } from './customer-folders.config.js';
import { CreateCustomerFolderDto } from './dto/create-customer-folder.dto.js';
import { FindCustomerFoldersQueryDto } from './dto/find-customer-folders-query.dto.js';
import { CustomerFoldersService } from './customer-folders.service.js';

const KEY = 'secret-key-123';
const BASE = 'https://api.customer.io/v1/assets';

const cfg = (values: Record<string, string | undefined>) => ({ get: (k: string) => values[k] }) as never;
const goodConfig = () => cfg({ CASTOMER_BASE_API_ENDPOINT: BASE, CASTOMER_APP_API_KEY: KEY });

const rawFolder = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `Folder ${id}`,
  parent_folder_id: null,
  created: 1_700_000_000,
  updated: 1_700_000_100,
  ...over,
});
const page = (folders: unknown[], total = folders.length) => ({
  folders,
  meta: { pagination: { page: 1, limit: PAGE_SIZE, total }, filters: {} },
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const fail = (status: number) => new Response('nope', { status });

function makeClient(config = goodConfig()) {
  const client = new CustomerApiClient(config);
  client.retryDelayMs = 0;
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readCustomerApiConfig', () => {
  it('повертає базу без кінцевого слеша та ключ', () => {
    expect(readCustomerApiConfig(cfg({ CASTOMER_BASE_API_ENDPOINT: `${BASE}//`, CASTOMER_APP_API_KEY: ` ${KEY} ` }))).toEqual({
      baseUrl: BASE,
      apiKey: KEY,
    });
  });

  it('кидає помилку, якщо змінної немає або вона порожня', () => {
    expect(() => readCustomerApiConfig(cfg({ CASTOMER_APP_API_KEY: KEY }))).toThrow(/CASTOMER_BASE_API_ENDPOINT/);
    expect(() => readCustomerApiConfig(cfg({ CASTOMER_BASE_API_ENDPOINT: BASE, CASTOMER_APP_API_KEY: '  ' }))).toThrow(/CASTOMER_APP_API_KEY/);
  });

  it('відхиляє базу, що закінчується на /folders, і невалідний URL', () => {
    expect(() => readCustomerApiConfig(cfg({ CASTOMER_BASE_API_ENDPOINT: `${BASE}/folders`, CASTOMER_APP_API_KEY: KEY }))).toThrow(/folders/);
    expect(() => readCustomerApiConfig(cfg({ CASTOMER_BASE_API_ENDPOINT: 'not a url', CASTOMER_APP_API_KEY: KEY }))).toThrow(/valid URL/);
  });
});

describe('CustomerApiClient', () => {
  it('робить GET з Bearer-ключем і розбирає відповідь (unix-секунди → Date)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(page([rawFolder(1), rawFolder(2, { parent_folder_id: 1 })])));
    vi.stubGlobal('fetch', fetchMock);

    const folders = await makeClient().listFolders();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/folders?page=1&limit=${PAGE_SIZE}`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(folders).toHaveLength(2);
    expect(folders[0]).toEqual({
      id: 1,
      name: 'Folder 1',
      parentFolderId: null,
      created: new Date('2023-11-14T22:13:20.000Z'),
      updated: new Date('2023-11-14T22:15:00.000Z'),
    });
    expect(folders[1]?.parentFolderId).toBe(1);
  });

  it('проходить усі сторінки', async () => {
    const first = Array.from({ length: PAGE_SIZE }, (_, i) => rawFolder(i + 1));
    const second = [rawFolder(PAGE_SIZE + 1)];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(page(first, PAGE_SIZE + 1)))
      .mockResolvedValueOnce(ok(page(second, PAGE_SIZE + 1)));
    vi.stubGlobal('fetch', fetchMock);

    const folders = await makeClient().listFolders();

    expect(folders).toHaveLength(PAGE_SIZE + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('page=2');
  });

  it('прибирає повтори за id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(page([rawFolder(1), rawFolder(1, { name: 'Dup' })]))));
    const folders = await makeClient().listFolders();
    expect(folders).toHaveLength(1);
  });

  it('повторює запит при 5xx і 429, потім успіх', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok(page([rawFolder(1)])));
    vi.stubGlobal('fetch', fetchMock);
    await expect(makeClient().listFolders()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('повторює при мережевій помилці', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(ok(page([rawFolder(1)])));
    vi.stubGlobal('fetch', fetchMock);
    await expect(makeClient().listFolders()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('після трьох невдач кидає BadGateway', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(500));
    vi.stubGlobal('fetch', fetchMock);
    await expect(makeClient().listFolders()).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('не повторює 401 і не показує ключ у повідомленні', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(401));
    vi.stubGlobal('fetch', fetchMock);
    const error = await makeClient()
      .listFolders()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('невалідний JSON і несподівана форма → BadGateway', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    await expect(makeClient().listFolders()).rejects.toBeInstanceOf(BadGatewayException);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ nothing: true })));
    await expect(makeClient().listFolders()).rejects.toBeInstanceOf(BadGatewayException);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(page([rawFolder(1, { id: 'x' })]))));
    await expect(makeClient().listFolders()).rejects.toBeInstanceOf(BadGatewayException);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(page([rawFolder(1, { name: null })]))));
    await expect(makeClient().listFolders()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('без ключів у конфігу → ServiceUnavailable, fetch не викликається', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(makeClient(cfg({})).listFolders()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

type Row = { externalId: number; name: string; parentExternalId: number | null; externalUpdatedAt: Date };
const remote = (id: number, over: Partial<{ name: string; parentFolderId: number | null; updated: Date }> = {}) => ({
  id,
  name: `Folder ${id}`,
  parentFolderId: null,
  created: new Date(1_700_000_000_000),
  updated: new Date(1_700_000_100_000),
  ...over,
});
const row = (id: number, over: Partial<Row> = {}): Row => ({
  externalId: id,
  name: `Folder ${id}`,
  parentExternalId: null,
  externalUpdatedAt: new Date(1_700_000_100_000),
  ...over,
});

/** Мінімальна in-memory імітація таблиці customer_folders. */
function makeService(initial: Row[], remoteFolders: ReturnType<typeof remote>[] | Error) {
  const table = new Map<number, Row>(initial.map((r) => [r.externalId, { ...r }]));

  const customerFolder = {
    findMany: vi.fn(() => Promise.resolve([...table.values()].map((r) => ({ ...r })))),
    deleteMany: vi.fn((args: { where: { externalId: { in: number[] } } }) => {
      let count = 0;
      for (const id of args.where.externalId.in) {
        if (table.delete(id)) {
          count++;
        }
      }
      return Promise.resolve({ count });
    }),
    createMany: vi.fn((args: { data: Array<Row & { externalCreatedAt: Date }>; skipDuplicates: boolean }) => {
      let count = 0;
      for (const item of args.data) {
        if (!table.has(item.externalId)) {
          table.set(item.externalId, { externalId: item.externalId, name: item.name, parentExternalId: item.parentExternalId, externalUpdatedAt: item.externalUpdatedAt });
          count++;
        }
      }
      return Promise.resolve({ count });
    }),
    update: vi.fn((args: { where: { externalId: number }; data: Partial<Row> }) => {
      const current = table.get(args.where.externalId);
      if (!current) {
        return Promise.reject(new Error('not found'));
      }
      Object.assign(current, args.data);
      return Promise.resolve(current);
    }),
  };
  const prisma = { customerFolder, $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)) };
  const client = {
    listFolders: vi.fn(() => (remoteFolders instanceof Error ? Promise.reject(remoteFolders) : Promise.resolve(remoteFolders))),
  };
  const service = new CustomerFoldersService(prisma as never, client as never);
  return { service, table, customerFolder, prisma, client };
}

describe('CustomerFoldersService.sync', () => {
  it('порожня таблиця: створює всі папки', async () => {
    const { service, table, customerFolder } = makeService([], [remote(1), remote(2, { parentFolderId: 1 })]);
    await expect(service.sync()).resolves.toEqual({ total: 2, created: 2, updated: 0, unchanged: 0, deleted: 0 });
    expect(table.size).toBe(2);
    expect(customerFolder.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(table.get(2)?.parentExternalId).toBe(1);
  });

  it('повторний запуск не створює дублів', async () => {
    const folders = [remote(1), remote(2), remote(3)];
    const { service, table, customerFolder } = makeService([], folders);
    await service.sync();
    const second = await service.sync();
    expect(second).toEqual({ total: 3, created: 0, updated: 0, unchanged: 3, deleted: 0 });
    expect(table.size).toBe(3);
    expect(customerFolder.createMany).toHaveBeenCalledTimes(1);
    expect(customerFolder.update).not.toHaveBeenCalled();
  });

  it('оновлює змінені папки (назва, батько, updated), решту не чіпає', async () => {
    const newer = new Date(1_700_000_500_000);
    const { service, table, customerFolder } = makeService(
      [row(1), row(2), row(3)],
      [remote(1, { name: 'Renamed' }), remote(2, { parentFolderId: 1 }), remote(3, { updated: newer }), remote(4)],
    );
    const result = await service.sync();
    expect(result).toEqual({ total: 4, created: 1, updated: 3, unchanged: 0, deleted: 0 });
    expect(table.get(1)?.name).toBe('Renamed');
    expect(table.get(2)?.parentExternalId).toBe(1);
    expect(table.get(3)?.externalUpdatedAt).toEqual(newer);
    expect(table.size).toBe(4);
    expect(customerFolder.update).toHaveBeenCalledTimes(3);
  });

  it('видаляє папки, яких більше немає в Customer.io', async () => {
    const { service, table, customerFolder } = makeService([row(1), row(98), row(99)], [remote(1)]);
    const result = await service.sync();
    expect(result).toEqual({ total: 1, created: 0, updated: 0, unchanged: 1, deleted: 2 });
    expect([...table.keys()]).toEqual([1]);
    expect(customerFolder.deleteMany).toHaveBeenCalledWith({ where: { externalId: { in: [98, 99] } } });
  });

  it('нічого не видаляє, якщо всі папки на місці', async () => {
    const { service, customerFolder } = makeService([row(1), row(2)], [remote(1), remote(2)]);
    await expect(service.sync()).resolves.toMatchObject({ deleted: 0 });
    expect(customerFolder.deleteMany).not.toHaveBeenCalled();
  });

  it('порожня відповідь при непорожній БД — запобіжник, видалення пропущено', async () => {
    const { service, table, customerFolder } = makeService([row(1), row(2)], []);
    await expect(service.sync()).resolves.toEqual({ total: 0, created: 0, updated: 0, unchanged: 0, deleted: 0 });
    expect(table.size).toBe(2);
    expect(customerFolder.deleteMany).not.toHaveBeenCalled();
  });

  it('created рахує лише реально вставлені рядки (гонка з іншим екземпляром)', async () => {
    const { service, customerFolder } = makeService([], [remote(1), remote(2)]);
    customerFolder.createMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.sync()).resolves.toMatchObject({ total: 2, created: 1 });
  });

  it('паралельний запуск → Conflict, після завершення замок знімається', async () => {
    const { service, client } = makeService([], []);
    let release!: () => void;
    client.listFolders.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve([]))));

    const first = service.sync();
    await expect(service.sync()).rejects.toBeInstanceOf(ConflictException);
    release();
    await first;
    await expect(service.sync()).resolves.toMatchObject({ total: 0 });
  });

  it('замок знімається і після помилки', async () => {
    const { service, client } = makeService([], new Error('boom'));
    await expect(service.sync()).rejects.toThrow('boom');
    client.listFolders.mockResolvedValueOnce([]);
    await expect(service.sync()).resolves.toMatchObject({ total: 0 });
  });
});

describe('CustomerFoldersService.syncDaily', () => {
  it('ковтає помилку, щоб cron не валив процес', async () => {
    const { service } = makeService([], new BadGatewayException('down'));
    await expect(service.syncDaily()).resolves.toBeUndefined();
  });

  it('успішний запуск наповнює таблицю', async () => {
    const { service, table } = makeService([], [remote(1)]);
    await service.syncDaily();
    expect(table.size).toBe(1);
  });
});

describe('CustomerFoldersService.findAll', () => {
  const rows = [
    { externalId: 2, name: 'Beta', parentExternalId: 1, externalCreatedAt: new Date(1_700_000_000_000), externalUpdatedAt: new Date(1_700_000_100_000) },
    { externalId: 1, name: 'Alpha', parentExternalId: null, externalCreatedAt: new Date(1_700_000_000_000), externalUpdatedAt: new Date(1_700_000_100_000) },
  ];
  const make = () => {
    const findMany = vi.fn().mockResolvedValue(rows);
    return { findMany, service: new CustomerFoldersService({ customerFolder: { findMany } } as never, {} as never) };
  };

  it('віддає id Customer.io, parentId і дати, без внутрішнього uuid', async () => {
    const { service, findMany } = make();
    const result = await service.findAll({});
    expect(result.total).toBe(2);
    expect(result.items[0]).toEqual({
      id: 2,
      name: 'Beta',
      parentId: 1,
      createdAt: new Date(1_700_000_000_000),
      updatedAt: new Date(1_700_000_100_000),
    });
    expect(findMany).toHaveBeenCalledWith({ where: undefined, orderBy: [{ name: 'asc' }, { externalId: 'asc' }] });
  });

  it('search шукає за частиною назви без урахування регістру', async () => {
    const { service, findMany } = make();
    await service.findAll({ search: 'alp' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { name: { contains: 'alp', mode: 'insensitive' } } }));
  });
});

describe('FindCustomerFoldersQueryDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parse = (plain: object) => pipe.transform(plain, { type: 'query', metatype: FindCustomerFoldersQueryDto }) as Promise<FindCustomerFoldersQueryDto>;

  it('приймає порожній запит і обрізає пробіли в search', async () => {
    await expect(parse({})).resolves.toEqual({});
    await expect(parse({ search: '  promo ' })).resolves.toMatchObject({ search: 'promo' });
  });

  it('відхиляє невідомі параметри й задовгий search', async () => {
    await expect(parse({ foo: 1 })).rejects.toThrow();
    await expect(parse({ search: 'x'.repeat(256) })).rejects.toThrow();
  });
});

describe('CustomerApiClient.createFolder', () => {
  const created = (over: Record<string, unknown> = {}) => ok({ folder: rawFolder(7, { name: 'test_api', ...over }) });

  it('шле POST з Bearer-ключем і JSON { name, parent_folder_id } та розбирає відповідь', async () => {
    const fetchMock = vi.fn().mockResolvedValue(created({ parent_folder_id: 3 }));
    vi.stubGlobal('fetch', fetchMock);

    const folder = await makeClient().createFolder('test_api', 3);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/folders`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'test_api', parent_folder_id: 3 });
    expect(folder).toMatchObject({ id: 7, name: 'test_api', parentFolderId: 3, created: new Date(1_700_000_000_000) });
  });

  it('для кореня шле parent_folder_id: null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(created());
    vi.stubGlobal('fetch', fetchMock);
    await makeClient().createFolder('test_api', null);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ name: 'test_api', parent_folder_id: null });
  });

  it('мапить 400/404/409 і не повторює запит', async () => {
    for (const [status, type] of [
      [400, BadRequestException],
      [404, NotFoundException],
      [409, ConflictException],
    ] as const) {
      const fetchMock = vi.fn().mockResolvedValue(fail(status));
      vi.stubGlobal('fetch', fetchMock);
      await expect(makeClient().createFolder('x', null)).rejects.toBeInstanceOf(type);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('401, 5xx, мережа, невалідна відповідь → BadGateway без повторів; ключ не витікає', async () => {
    for (const mock of [
      vi.fn().mockResolvedValue(fail(401)),
      vi.fn().mockResolvedValue(fail(500)),
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      vi.fn().mockResolvedValue(ok({ nothing: true })),
      vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })),
    ]) {
      vi.stubGlobal('fetch', mock);
      const error = await makeClient()
        .createFolder('x', null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as Error).message).not.toContain(KEY);
      expect(mock).toHaveBeenCalledTimes(1);
    }
  });

  it('без ключів → ServiceUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(makeClient(cfg({})).createFolder('x', null)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('CustomerFoldersService.create', () => {
  const remoteCreated = remote(7, { name: 'test_api', parentFolderId: 3 });
  const make = (upsert = vi.fn().mockResolvedValue({})) => {
    const createFolder = vi.fn().mockResolvedValue(remoteCreated);
    const service = new CustomerFoldersService({ customerFolder: { upsert } } as never, { createFolder } as never);
    return { service, createFolder, upsert };
  };

  it('створює в Customer.io, зберігає в БД upsert-ом і віддає id Customer.io', async () => {
    const { service, createFolder, upsert } = make();
    const result = await service.create({ name: 'test_api', parentId: 3 });
    expect(createFolder).toHaveBeenCalledWith('test_api', 3);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: 7 }, create: expect.objectContaining({ externalId: 7, name: 'test_api', parentExternalId: 3 }) }),
    );
    expect(result).toEqual({ id: 7, name: 'test_api', parentId: 3, createdAt: remoteCreated.created, updatedAt: remoteCreated.updated });
  });

  it('без parentId передає null', async () => {
    const { service, createFolder } = make();
    await service.create({ name: 'root' });
    expect(createFolder).toHaveBeenCalledWith('root', null);
  });

  it('помилка Customer.io йде нагору, у БД нічого не пишеться', async () => {
    const { service, createFolder, upsert } = make();
    createFolder.mockRejectedValueOnce(new ConflictException('dup'));
    await expect(service.create({ name: 'x' })).rejects.toBeInstanceOf(ConflictException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('збій БД після створення не ламає відповідь', async () => {
    const { service } = make(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(service.create({ name: 'test_api' })).resolves.toMatchObject({ id: 7 });
  });
});

describe('CreateCustomerFolderDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parse = (plain: object) => pipe.transform(plain, { type: 'body', metatype: CreateCustomerFolderDto }) as Promise<CreateCustomerFolderDto>;

  it('приймає name без parentId, з null і з числом; обрізає пробіли', async () => {
    await expect(parse({ name: ' test_api ' })).resolves.toMatchObject({ name: 'test_api' });
    await expect(parse({ name: 'a', parentId: null })).resolves.toMatchObject({ parentId: null });
    await expect(parse({ name: 'a', parentId: 5 })).resolves.toMatchObject({ parentId: 5 });
  });

  it('відхиляє порожню назву, нецілий/нульовий parentId і зайві поля', async () => {
    await expect(parse({})).rejects.toThrow();
    await expect(parse({ name: '   ' })).rejects.toThrow();
    await expect(parse({ name: 'x'.repeat(256) })).rejects.toThrow();
    await expect(parse({ name: 'a', parentId: 0 })).rejects.toThrow();
    await expect(parse({ name: 'a', parentId: 1.5 })).rejects.toThrow();
    await expect(parse({ name: 'a', parentId: '5' })).rejects.toThrow();
    await expect(parse({ name: 'a', parent_folder_id: 5 })).rejects.toThrow();
  });
});
