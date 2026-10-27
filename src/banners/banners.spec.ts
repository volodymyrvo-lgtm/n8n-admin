import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BannersService, MAX_BANNER_BYTES, REMOVE_BATCH_SIZE } from './banners.service.js';
import { CreateBannerDto } from './dto/create-banner.dto.js';
import { ReplaceBannerDto } from './dto/replace-banner.dto.js';
import { DeleteBannersDto, MAX_BULK_DELETE } from './dto/delete-banners.dto.js';
import { FindBannersQueryDto } from './dto/find-banners-query.dto.js';
import { uuidv7 } from './uuid7.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = (plain: object) => pipe.transform(plain, { type: 'body', metatype: CreateBannerDto }) as Promise<CreateBannerDto>;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest-of-image')]);
const file = (buffer: Buffer) => ({ buffer, size: buffer.length });
const JOB_ID = '11111111-1111-4111-8111-111111111111';

function makeService(opts: { jobExists?: boolean; dbFails?: boolean } = {}) {
  const bannerCreate = vi.fn((args: { data: Record<string, unknown> }) =>
    opts.dbFails
      ? Promise.reject(new Error('db down'))
      : Promise.resolve({ status: 'pending', createdAt: new Date('2026-10-23T10:00:00Z'), jobId: null, ...args.data }),
  );
  const jobFindUnique = vi.fn().mockResolvedValue(opts.jobExists === false ? null : { id: JOB_ID });
  const prisma = { banner: { create: bannerCreate }, job: { findUnique: jobFindUnique } };
  const storage = {
    buildPath: vi.fn((id: string) => `${id}/file.png`),
    upload: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const service = new BannersService(prisma as never, storage as never);
  return { service, bannerCreate, jobFindUnique, storage };
}

describe('uuidv7', () => {
  it('має формат v7 і зростає за часом', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.slice(0, 13) < b.slice(0, 13)).toBe(true);
  });
});

describe('POST /banners — CreateBannerDto', () => {
  it('приймає figmaImageName і необов\'язковий jobId, обрізає пробіли', async () => {
    await expect(parse({ figmaImageName: '  Banner_01  ' })).resolves.toMatchObject({ figmaImageName: 'Banner_01' });
    await expect(parse({ figmaImageName: 'b', jobId: JOB_ID })).resolves.toMatchObject({ jobId: JOB_ID });
  });

  it('порожній jobId із форми вважається незаданим', async () => {
    const dto = await parse({ figmaImageName: 'b', jobId: '' });
    expect(dto.jobId).toBeUndefined();
  });

  it('відхиляє порожню назву, не-UUID jobId і зайві поля', async () => {
    await expect(parse({ figmaImageName: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse({ figmaImageName: 'b', jobId: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse({ figmaImageName: 'b', status: 'approved' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BannersService.create', () => {
  it('кладе PNG у Storage й створює pending-запис; storagePath у відповідь не потрапляє', async () => {
    const { service, storage, bannerCreate } = makeService();

    const result = await service.create({ figmaImageName: 'Banner_01' }, file(PNG));

    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/\/file\.png$/), PNG, { contentType: 'image/png' });
    const data = bannerCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ figmaImageName: 'Banner_01', mimeType: 'image/png', sizeBytes: PNG.length });
    expect(data['storagePath']).toBe(`${data['id'] as string}/file.png`);
    expect(result).toMatchObject({ id: data['id'], status: 'pending', sizeBytes: PNG.length });
    expect(result).not.toHaveProperty('storagePath');
  });

  it('без файлу → 400', async () => {
    const { service, storage } = makeService();
    await expect(service.create({ figmaImageName: 'b' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ figmaImageName: 'b' }, file(Buffer.alloc(0)))).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('не-PNG (навіть з правильним розширенням) → 400, у Storage нічого не йде', async () => {
    const { service, storage } = makeService();
    await expect(service.create({ figmaImageName: 'b' }, file(Buffer.from('GIF89a....')))).rejects.toThrow('Only PNG');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('занадто великий файл → 400', async () => {
    const { service } = makeService();
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_BANNER_BYTES)]);
    await expect(service.create({ figmaImageName: 'b' }, file(big))).rejects.toThrow('too large');
  });

  it('неіснуюча джоба → 400 ДО завантаження файлу', async () => {
    const { service, storage } = makeService({ jobExists: false });
    await expect(service.create({ figmaImageName: 'b', jobId: JOB_ID }, file(PNG))).rejects.toThrow('not found');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('існуюча джоба прив\'язується до банера', async () => {
    const { service, bannerCreate } = makeService();
    await service.create({ figmaImageName: 'b', jobId: JOB_ID }, file(PNG));
    expect(bannerCreate.mock.calls[0]![0].data).toMatchObject({ jobId: JOB_ID });
  });

  it('збій запису в БД → файл прибирається зі Storage, помилка прокидається далі', async () => {
    const { service, storage } = makeService({ dbFails: true });
    await expect(service.create({ figmaImageName: 'b' }, file(PNG))).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(storage.upload.mock.calls[0]![0]);
  });
});

describe('GET /banners — FindBannersQueryDto', () => {
  const parseQuery = (plain: object) => pipe.transform(plain, { type: 'query', metatype: FindBannersQueryDto }) as Promise<FindBannersQueryDto>;

  it('значення за замовчуванням: сторінка 1, 20 на сторінку, без фільтрів', async () => {
    const dto = await parseQuery({});
    expect(dto).toMatchObject({ page: 1, limit: 20 });
    expect(dto.status).toBeUndefined();
  });

  it('status приймає список через кому і повтором параметра', async () => {
    expect((await parseQuery({ status: 'pending,rejected' })).status).toEqual(['pending', 'rejected']);
    expect((await parseQuery({ status: ['pending', 'sent'] })).status).toEqual(['pending', 'sent']);
  });

  it('відхиляє невідомий статус, не-UUID jobId, limit > 100 і зайві параметри', async () => {
    await expect(parseQuery({ status: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parseQuery({ jobId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parseQuery({ limit: '101' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parseQuery({ sortBy: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BannersService.findAll', () => {
  const row = (n: number) => ({
    id: `id-${n}`,
    jobId: null,
    figmaImageName: `Banner_${n}`,
    storagePath: `id-${n}/f.png`,
    mimeType: 'image/png',
    sizeBytes: 100,
    status: 'pending',
    createdAt: new Date('2026-10-23T10:00:00Z'),
  });

  function makeListService(rows: ReturnType<typeof row>[], total = rows.length) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const count = vi.fn().mockResolvedValue(total);
    const prisma = { banner: { findMany, count }, $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)) };
    const storage = {
      createSignedUrls: vi.fn().mockResolvedValue(new Map(rows.map((r) => [r.storagePath, `https://signed/${r.id}`]))),
    };
    return { service: new BannersService(prisma as never, storage as never), findMany, count, storage };
  }

  it('віддає елементи з imageUrl, без storagePath, і метадані пагінації', async () => {
    const { service, storage } = makeListService([row(1), row(2)], 7);

    const result = await service.findAll({ page: 2, limit: 2 });

    expect(result).toMatchObject({ total: 7, page: 2, limit: 2 });
    expect(result.items.map((i) => i.imageUrl)).toEqual(['https://signed/id-1', 'https://signed/id-2']);
    expect(result.items[0]).not.toHaveProperty('storagePath');
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(['id-1/f.png', 'id-2/f.png']);
  });

  it('перекладає фільтри й пагінацію в запит; найновіші першими', async () => {
    const { service, findMany, count } = makeListService([]);

    await service.findAll({ page: 3, limit: 10, status: ['pending', 'rejected'] as never, jobId: JOB_ID, search: 'az' });

    const args = findMany.mock.calls[0]![0];
    expect(args).toMatchObject({
      where: {
        status: { in: ['pending', 'rejected'] },
        jobId: JOB_ID,
        figmaImageName: { contains: 'az', mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 10,
    });
    expect(count.mock.calls[0]![0]).toMatchObject({ where: args.where });
  });

  it('без фільтрів не додає умов', async () => {
    const { service, findMany } = makeListService([]);
    await service.findAll({ page: 1, limit: 20 });
    expect(findMany.mock.calls[0]![0].where).toEqual({ status: undefined, jobId: undefined, figmaImageName: undefined });
  });

  it('якщо Storage не підписав URL (чи недоступний), список усе одно віддається з imageUrl: null', async () => {
    const { service, storage } = makeListService([row(1)]);
    storage.createSignedUrls.mockRejectedValue(new Error('storage down'));

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.imageUrl).toBeNull();
  });
});

describe('BannersService.remove', () => {
  function makeRemoveService(found: boolean) {
    const calls: string[] = [];
    const prisma = {
      banner: {
        findUnique: vi.fn().mockResolvedValue(found ? { storagePath: 'id-1/f.png' } : null),
        deleteMany: vi.fn(() => {
          calls.push('db');
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const storage = {
      remove: vi.fn(() => {
        calls.push('file');
        return Promise.resolve();
      }),
    };
    return { service: new BannersService(prisma as never, storage as never), prisma, storage, calls };
  }

  it('видаляє файл, а потім рядок (саме в такому порядку)', async () => {
    const { service, storage, prisma, calls } = makeRemoveService(true);
    await service.remove('id-1');
    expect(storage.remove).toHaveBeenCalledWith('id-1/f.png');
    expect(prisma.banner.deleteMany).toHaveBeenCalledWith({ where: { id: 'id-1' } });
    expect(calls).toEqual(['file', 'db']);
  });

  it('неіснуючий банер → 404, нічого не видаляється', async () => {
    const { service, storage, prisma } = makeRemoveService(false);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(prisma.banner.deleteMany).not.toHaveBeenCalled();
  });

  it('якщо файл не видалився, рядок у БД лишається (можна повторити)', async () => {
    const { service, storage, prisma } = makeRemoveService(true);
    storage.remove.mockRejectedValue(new Error('storage down'));
    await expect(service.remove('id-1')).rejects.toThrow('storage down');
    expect(prisma.banner.deleteMany).not.toHaveBeenCalled();
  });
});

describe('BannersService.removeAll', () => {
  const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${from + i}`, storagePath: `id-${from + i}/f.png` }));

  function makeRemoveAllService(batches: Array<Array<{ id: string; storagePath: string }>>) {
    const findMany = vi.fn();
    for (const batch of batches) findMany.mockResolvedValueOnce(batch);
    findMany.mockResolvedValue([]);
    const deleteMany = vi.fn((args: { where: { id: { in: string[] } } }) => Promise.resolve({ count: args.where.id.in.length }));
    const prisma = { banner: { findMany, deleteMany } };
    const storage = { removeMany: vi.fn().mockResolvedValue(undefined) };
    return { service: new BannersService(prisma as never, storage as never), findMany, deleteMany, storage };
  }

  it('порожня таблиця → deletedCount 0, Storage не чіпається', async () => {
    const { service, storage, deleteMany } = makeRemoveAllService([]);
    await expect(service.removeAll()).resolves.toEqual({ deletedCount: 0 });
    expect(storage.removeMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('видаляє пакетами: спершу файли пакета, потім його рядки; рахує всі', async () => {
    const { service, storage, deleteMany, findMany } = makeRemoveAllService([rows(1, REMOVE_BATCH_SIZE), rows(1000, 3)]);

    await expect(service.removeAll()).resolves.toEqual({ deletedCount: REMOVE_BATCH_SIZE + 3 });

    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: REMOVE_BATCH_SIZE });
    expect(storage.removeMany).toHaveBeenCalledTimes(2);
    expect(storage.removeMany.mock.calls[1]![0]).toEqual(['id-1000/f.png', 'id-1001/f.png', 'id-1002/f.png']);
    expect(deleteMany.mock.calls[1]![0]).toEqual({ where: { id: { in: ['id-1000', 'id-1001', 'id-1002'] } } });
  });

  it('збій Storage посеред роботи: рядки цього пакета лишаються, помилка прокидається', async () => {
    const { service, storage, deleteMany } = makeRemoveAllService([rows(1, 2), rows(10, 2)]);
    storage.removeMany.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage down'));

    await expect(service.removeAll()).rejects.toThrow('storage down');
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe('BannersService.removeMany', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const row = (n: number) => ({ id: id(n), storagePath: `${id(n)}/f.png` });

  function make(existing: Array<{ id: string; storagePath: string }>) {
    const findMany = vi.fn().mockResolvedValue(existing);
    const deleteMany = vi.fn((args: { where: { id: { in: string[] } } }) => Promise.resolve({ count: args.where.id.in.length }));
    const storage = { removeMany: vi.fn().mockResolvedValue(undefined) };
    return { service: new BannersService({ banner: { findMany, deleteMany } } as never, storage as never), findMany, deleteMany, storage };
  }

  it('видаляє лише вказані: шукає за id, чистить файли, потім рядки', async () => {
    const { service, findMany, storage, deleteMany } = make([row(1), row(2)]);
    await expect(service.removeMany([id(1), id(2)])).resolves.toEqual({ deletedCount: 2, notFoundIds: [] });
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { id: { in: [id(1), id(2)] } } });
    expect(storage.removeMany).toHaveBeenCalledWith([`${id(1)}/f.png`, `${id(2)}/f.png`]);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: [id(1), id(2)] } } });
  });

  it('неіснуючі id повертає в notFoundIds без помилки, повтори ігнорує', async () => {
    const { service, storage } = make([row(1)]);
    await expect(service.removeMany([id(1), id(9), id(1), id(9)])).resolves.toEqual({ deletedCount: 1, notFoundIds: [id(9)] });
    expect(storage.removeMany).toHaveBeenCalledTimes(1);
  });

  it('жодного знайденого → Storage і БД не чіпаються', async () => {
    const { service, storage, deleteMany } = make([]);
    await expect(service.removeMany([id(5)])).resolves.toEqual({ deletedCount: 0, notFoundIds: [id(5)] });
    expect(storage.removeMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('великий список ріже на пакети по REMOVE_BATCH_SIZE', async () => {
    const all = Array.from({ length: REMOVE_BATCH_SIZE + 5 }, (_, i) => row(i + 1));
    const { service, storage } = make(all);
    await expect(service.removeMany(all.map((r) => r.id))).resolves.toMatchObject({ deletedCount: REMOVE_BATCH_SIZE + 5 });
    expect(storage.removeMany).toHaveBeenCalledTimes(2);
  });

  it('збій Storage: рядки цього пакета лишаються, помилка прокидається', async () => {
    const { service, storage, deleteMany } = make([row(1)]);
    storage.removeMany.mockRejectedValueOnce(new Error('storage down'));
    await expect(service.removeMany([id(1)])).rejects.toThrow('storage down');
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('POST /banners/bulk-delete — DeleteBannersDto', () => {
  const dtoPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parseDto = (plain: object) => dtoPipe.transform(plain, { type: 'body', metatype: DeleteBannersDto }) as Promise<DeleteBannersDto>;
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('приймає список uuid і прибирає повтори', async () => {
    await expect(parseDto({ ids: [uuid(1), uuid(2), uuid(1)] })).resolves.toMatchObject({ ids: [uuid(1), uuid(2)] });
  });

  it('відхиляє порожній список, не-uuid, не масив, зайві поля й понад ліміт', async () => {
    await expect(parseDto({ ids: [] })).rejects.toThrow();
    await expect(parseDto({ ids: ['abc'] })).rejects.toThrow();
    await expect(parseDto({ ids: uuid(1) })).rejects.toThrow();
    await expect(parseDto({})).rejects.toThrow();
    await expect(parseDto({ ids: [uuid(1)], all: true })).rejects.toThrow();
    await expect(parseDto({ ids: Array.from({ length: MAX_BULK_DELETE + 1 }, (_, i) => uuid(i + 1)) })).rejects.toThrow();
  });
});

describe('BannersService.replaceImage', () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  const OLD_PATH = `${ID}/old.png`;
  const NEW_PATH = `${ID}/new.png`;
  const dbRow = (over: Record<string, unknown> = {}) => ({
    id: ID,
    jobId: null,
    figmaImageName: 'banner',
    storagePath: NEW_PATH,
    mimeType: 'image/png',
    sizeBytes: PNG.length,
    status: 'pending',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    ...over,
  });

  function make(opts: { current?: { storagePath: string; status: string } | null; updateCount?: number; updateFails?: boolean } = {}) {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(opts.current === undefined ? { storagePath: OLD_PATH, status: 'rejected' } : opts.current)
      .mockResolvedValue(dbRow());
    const updateMany = vi.fn((_args: { data: Record<string, unknown> }) => (opts.updateFails ? Promise.reject(new Error('db down')) : Promise.resolve({ count: opts.updateCount ?? 1 })));
    const storage = {
      buildPath: vi.fn(() => NEW_PATH),
      upload: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      createSignedUrl: vi.fn().mockResolvedValue('https://signed/new.png'),
    };
    const service = new BannersService({ banner: { findUnique, updateMany } } as never, storage as never);
    return { service, findUnique, updateMany, storage };
  }

  it('кладе новий файл, оновлює рядок (шлях, розмір, pending), потім видаляє старий файл', async () => {
    const { service, updateMany, storage } = make();
    const result = await service.replaceImage(ID, {}, file(PNG));

    expect(storage.upload).toHaveBeenCalledWith(NEW_PATH, PNG, { contentType: 'image/png' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: { notIn: ['sending', 'sent'] } },
      data: { storagePath: NEW_PATH, mimeType: 'image/png', sizeBytes: PNG.length, status: 'pending' },
    });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(OLD_PATH);
    expect(result).toMatchObject({ id: ID, status: 'pending', imageUrl: 'https://signed/new.png' });
    expect(result).not.toHaveProperty('storagePath');
  });

  it('нова назва потрапляє в update лише якщо передана', async () => {
    const { service, updateMany } = make();
    await service.replaceImage(ID, { figmaImageName: 'renamed' }, file(PNG));
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({ figmaImageName: 'renamed' });
  });

  it('невалідний файл → 400 до будь-яких звернень до БД чи Storage', async () => {
    const { service, findUnique, storage } = make();
    await expect(service.replaceImage(ID, {}, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replaceImage(ID, {}, file(Buffer.from('not a png')))).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('банера немає → 404, файл не завантажується', async () => {
    const { service, storage } = make({ current: null });
    await expect(service.replaceImage(ID, {}, file(PNG))).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('sending або sent → 409 без завантаження файлу', async () => {
    for (const status of ['sending', 'sent']) {
      const { service, storage } = make({ current: { storagePath: OLD_PATH, status } });
      await expect(service.replaceImage(ID, {}, file(PNG))).rejects.toBeInstanceOf(ConflictException);
      expect(storage.upload).not.toHaveBeenCalled();
    }
  });

  it('статус змінився між перевіркою й оновленням (count 0) → 409, новий файл прибирається, старий лишається', async () => {
    const { service, storage } = make({ updateCount: 0 });
    await expect(service.replaceImage(ID, {}, file(PNG))).rejects.toBeInstanceOf(ConflictException);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(NEW_PATH);
  });

  it('збій БД → новий файл прибирається, помилка прокидається, старий файл не чіпається', async () => {
    const { service, storage } = make({ updateFails: true });
    await expect(service.replaceImage(ID, {}, file(PNG))).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(NEW_PATH);
  });

  it('збій видалення старого файлу не ламає заміну', async () => {
    const { service, storage } = make();
    storage.remove.mockRejectedValueOnce(new Error('storage down'));
    await expect(service.replaceImage(ID, {}, file(PNG))).resolves.toMatchObject({ id: ID });
  });

  it('збій підпису URL не ламає заміну: imageUrl null', async () => {
    const { service, storage } = make();
    storage.createSignedUrl.mockRejectedValueOnce(new Error('sign down'));
    await expect(service.replaceImage(ID, {}, file(PNG))).resolves.toMatchObject({ imageUrl: null });
  });

  it('збій завантаження нового файлу: БД не чіпається', async () => {
    const { service, storage, updateMany } = make();
    storage.upload.mockRejectedValueOnce(new Error('upload failed'));
    await expect(service.replaceImage(ID, {}, file(PNG))).rejects.toThrow('upload failed');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('PUT /banners/:id/image — ReplaceBannerDto', () => {
  const dtoPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parseDto = (plain: object) => dtoPipe.transform(plain, { type: 'body', metatype: ReplaceBannerDto }) as Promise<ReplaceBannerDto>;

  it('поле необов\'язкове; порожній рядок = не задано; пробіли обрізаються', async () => {
    await expect(parseDto({})).resolves.toEqual({});
    await expect(parseDto({ figmaImageName: '   ' })).resolves.toEqual({ figmaImageName: undefined });
    await expect(parseDto({ figmaImageName: '  new  ' })).resolves.toMatchObject({ figmaImageName: 'new' });
  });

  it('відхиляє задовгу назву та зайві поля', async () => {
    await expect(parseDto({ figmaImageName: 'x'.repeat(256) })).rejects.toThrow();
    await expect(parseDto({ jobId: 'x' })).rejects.toThrow();
  });
});
