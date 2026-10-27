import { BadGatewayException, ConflictException, ValidationPipe } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerApiClient } from '../customer-folders/customer-api.client.js';
import { BannersSendService, CUSTOMER_MAX_FILE_BYTES, SEND_TIME_BUDGET_MS, uploadFilename } from './banners-send.service.js';
import { SendBannersDto } from './dto/send-banners.dto.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: uuid(n),
  figmaImageName: `banner${n}.png`,
  storagePath: `${uuid(n)}/f.png`,
  mimeType: 'image/png',
  sizeBytes: 1000,
  ...over,
});

function make(rows: Array<ReturnType<typeof row>>) {
  const update = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValue(rows);
  const storage = { download: vi.fn().mockResolvedValue(Buffer.from('png-bytes')), remove: vi.fn().mockResolvedValue(undefined) };
  let nextAssetId = 100;
  const customerApi = {
    uploadFile: vi
      .fn()
      .mockImplementation((input: { name: string; parentFolderId: number | null }) =>
        Promise.resolve({ id: nextAssetId++, name: input.name, path: `https://assets.example/${input.name}`, parentFolderId: input.parentFolderId, size: 1234 }),
      ),
  };
  const assetUpsert = vi.fn().mockResolvedValue({});
  const service = new BannersSendService({ banner: { findMany, update, deleteMany }, customerAsset: { upsert: assetUpsert } } as never, storage as never, customerApi as never);
  return { service, update, findMany, storage, customerApi, assetUpsert, deleteMany };
}

const statuses = (update: ReturnType<typeof vi.fn>, id: string) =>
  update.mock.calls.filter((c) => (c[0] as { where: { id: string } }).where.id === id).map((c) => (c[0] as { data: { status: string } }).data.status);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BannersSendService.send', () => {
  it('відправляє по одному: sending → upload → файл і рядок банера видаляються', async () => {
    const { service, update, storage, customerApi, findMany, deleteMany } = make([row(1), row(2)]);

    const result = await service.send({ parentId: 5 });

    expect(result).toMatchObject({ total: 2, sent: 2, failed: 0, remaining: 0, skippedIds: [] });
    expect(result.results[0]).toEqual({ id: uuid(1), figmaImageName: 'banner1.png', status: 'sent', customerAssetId: 100, customerName: 'banner1.png', customerPath: 'https://assets.example/banner1.png' });
    expect(customerApi.uploadFile).toHaveBeenCalledTimes(2);
    expect(customerApi.uploadFile.mock.calls[0]![0]).toEqual({
      filename: 'banner1.png',
      content: Buffer.from('png-bytes'),
      contentType: 'image/png',
      name: 'banner1.png',
      parentFolderId: 5,
    });
    expect(statuses(update, uuid(1))).toEqual(['sending']);
    expect(storage.remove).toHaveBeenCalledWith(`${uuid(1)}/f.png`);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: uuid(1) } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: uuid(2) } });
    // запит бере лише не-sent банери
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { status: { not: 'sent' } } });
  });

  it('записує в customer_assets emailId = figmaImageName і path з відповіді Customer.io', async () => {
    const { service, assetUpsert } = make([row(1), row(2)]);
    await service.send({ parentId: 5 });

    expect(assetUpsert).toHaveBeenCalledTimes(2);
    expect(assetUpsert.mock.calls[0]![0]).toEqual({
      where: { externalId: 100 },
      create: { externalId: 100, emailId: 'banner1.png', path: 'https://assets.example/banner1.png', name: 'banner1.png', parentFolderId: 5, sizeBytes: 1234 },
      update: { emailId: 'banner1.png', path: 'https://assets.example/banner1.png', name: 'banner1.png', parentFolderId: 5, sizeBytes: 1234 },
    });
    expect(assetUpsert.mock.calls[1]![0]).toMatchObject({ where: { externalId: 101 }, create: { emailId: 'banner2.png' } });
  });

  it('для невдалої відправки запису в customer_assets немає', async () => {
    const { service, customerApi, assetUpsert } = make([row(1)]);
    customerApi.uploadFile.mockRejectedValueOnce(new BadGatewayException('down'));
    await service.send({});
    expect(assetUpsert).not.toHaveBeenCalled();
  });

  it('збій запису в customer_assets не ламає відправку: sent + warning, банер видаляється', async () => {
    const { service, assetUpsert, storage, deleteMany } = make([row(1)]);
    assetUpsert.mockRejectedValueOnce(new Error('db down'));
    const result = await service.send({});
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({ status: 'sent', warning: expect.stringContaining('asset record') });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('figmaImageName без розширення: і filename, і name йдуть з .png, а в customer_assets лишається чистий figmaImageName', async () => {
    const { service, customerApi, assetUpsert } = make([row(1, { figmaImageName: '124_en' })]);
    await service.send({});
    expect(customerApi.uploadFile.mock.calls[0]![0]).toMatchObject({ filename: '124_en.png', name: '124_en.png', contentType: 'image/png' });
    expect(assetUpsert.mock.calls[0]![0]).toMatchObject({ create: { emailId: '124_en' } });
  });

  it('без parentId кладе в корінь (null)', async () => {
    const { service, customerApi } = make([row(1)]);
    await service.send({});
    expect(customerApi.uploadFile.mock.calls[0]![0]).toMatchObject({ parentFolderId: null });
  });

  it('з ids обмежує вибірку й віддає skippedIds для відсутніх/вже sent', async () => {
    const { service, findMany } = make([row(1)]);
    const result = await service.send({ ids: [uuid(1), uuid(9)] });
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { status: { not: 'sent' }, id: { in: [uuid(1), uuid(9)] } } });
    expect(result.skippedIds).toEqual([uuid(9)]);
  });

  it('збій одного банера → send_failed, файл і рядок лишаються, решта відправляється', async () => {
    const { service, update, storage, customerApi, deleteMany } = make([row(1), row(2)]);
    customerApi.uploadFile.mockRejectedValueOnce(new BadGatewayException('Customer API is unreachable'));

    const result = await service.send({});

    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(result.results[0]).toEqual({ id: uuid(1), figmaImageName: 'banner1.png', status: 'send_failed', error: 'Customer API is unreachable' });
    expect(statuses(update, uuid(1))).toEqual(['sending', 'send_failed']);
    expect(statuses(update, uuid(2))).toEqual(['sending']);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(`${uuid(2)}/f.png`);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: uuid(2) } });
  });

  it('збій скачування зі Storage → send_failed без звернення до Customer.io', async () => {
    const { service, storage, customerApi } = make([row(1)]);
    storage.download.mockRejectedValueOnce(new Error('File not found'));
    const result = await service.send({});
    expect(result.results[0]).toMatchObject({ status: 'send_failed', error: 'File not found' });
    expect(customerApi.uploadFile).not.toHaveBeenCalled();
  });

  it(`файл більший за ${CUSTOMER_MAX_FILE_BYTES} байт одразу send_failed, без завантаження`, async () => {
    const { service, update, storage, customerApi } = make([row(1, { sizeBytes: CUSTOMER_MAX_FILE_BYTES + 1 })]);
    const result = await service.send({});
    expect(result.results[0]).toMatchObject({ status: 'send_failed', error: expect.stringContaining('2 MB') });
    expect(statuses(update, uuid(1))).toEqual(['send_failed']);
    expect(storage.download).not.toHaveBeenCalled();
    expect(customerApi.uploadFile).not.toHaveBeenCalled();
  });

  it('збій видалення файлу після успіху: рядок лишається зі статусом sent, є warning', async () => {
    const { service, storage, update, deleteMany } = make([row(1)]);
    storage.remove.mockRejectedValueOnce(new Error('storage down'));
    const result = await service.send({});
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({ status: 'sent', warning: expect.stringContaining('marked sent') });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(statuses(update, uuid(1))).toEqual(['sending', 'sent']);
  });

  it('збій видалення рядка після видалення файлу: теж sent + warning', async () => {
    const { service, deleteMany, update } = make([row(1)]);
    deleteMany.mockRejectedValueOnce(new Error('db down'));
    const result = await service.send({});
    expect(result.results[0]).toMatchObject({ status: 'sent', warning: expect.stringContaining('marked sent') });
    expect(statuses(update, uuid(1))).toEqual(['sending', 'sent']);
  });

  it('після вичерпання часу зупиняється й повертає remaining', async () => {
    const { service, customerApi } = make([row(1), row(2), row(3)]);
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    customerApi.uploadFile.mockImplementationOnce(() => {
      now += SEND_TIME_BUDGET_MS + 1; // перший виклик «довгий»
      return Promise.resolve({ id: 1, name: 'x', path: null, parentFolderId: null, size: null });
    });

    const result = await service.send({});

    expect(result).toMatchObject({ total: 3, sent: 1, remaining: 2 });
    expect(customerApi.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('паралельний запуск → 409, після завершення замок знімається', async () => {
    const { service, customerApi } = make([row(1)]);
    let release!: () => void;
    customerApi.uploadFile.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ id: 1, name: 'x', path: null, parentFolderId: null, size: null }))));

    const first = service.send({});
    await vi.waitFor(() => expect(customerApi.uploadFile).toHaveBeenCalled());
    await expect(service.send({})).rejects.toBeInstanceOf(ConflictException);
    release();
    await first;
    await expect(service.send({})).resolves.toMatchObject({ total: 1 });
  });

  it('нічого відправляти → порожній результат', async () => {
    const { service, customerApi } = make([]);
    await expect(service.send({})).resolves.toEqual({ total: 0, sent: 0, failed: 0, remaining: 0, skippedIds: [], results: [] });
    expect(customerApi.uploadFile).not.toHaveBeenCalled();
  });
});

describe('POST /banners/send — SendBannersDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parse = (plain: object) => pipe.transform(plain, { type: 'body', metatype: SendBannersDto }) as Promise<SendBannersDto>;

  it('приймає порожнє тіло, parentId (число або null) і ids без повторів', async () => {
    await expect(parse({})).resolves.toEqual({});
    await expect(parse({ parentId: null })).resolves.toMatchObject({ parentId: null });
    await expect(parse({ parentId: 4, ids: [uuid(1), uuid(1), uuid(2)] })).resolves.toMatchObject({ parentId: 4, ids: [uuid(1), uuid(2)] });
  });

  it('відхиляє хибні значення й зайві поля', async () => {
    await expect(parse({ parentId: 0 })).rejects.toThrow();
    await expect(parse({ parentId: '4' })).rejects.toThrow();
    await expect(parse({ ids: [] })).rejects.toThrow();
    await expect(parse({ ids: ['abc'] })).rejects.toThrow();
    await expect(parse({ parent_folder_id: 4 })).rejects.toThrow();
  });
});

describe('CustomerApiClient.uploadFile', () => {
  const KEY = 'secret-key-123';
  const BASE = 'https://api-eu.customer.io/v1/assets';
  const cfg = { get: (k: string) => ({ CASTOMER_BASE_API_ENDPOINT: BASE, CASTOMER_APP_API_KEY: KEY })[k] } as never;
  const input = { filename: 'test1.png', content: Buffer.from('abc'), contentType: 'image/png', name: 'test1.png', parentFolderId: 7 };
  const okAsset = () =>
    new Response(JSON.stringify({ asset: { id: 99, name: 'test1.png', parent_folder_id: 7, path: 'https://x/y.png', size: 3, created: 1, updated: 1 } }), { status: 200 });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('шле multipart POST /files з file, name, parent_folder_id і Bearer-ключем', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okAsset());
    vi.stubGlobal('fetch', fetchMock);

    const asset = await new CustomerApiClient(cfg).uploadFile(input);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/files`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${KEY}`);
    expect(headers['Content-Type']).toBeUndefined(); // boundary виставляє fetch
    const form = init.body as FormData;
    expect(form.get('name')).toBe('test1.png');
    expect(form.get('parent_folder_id')).toBe('7');
    const file = form.get('file') as File;
    expect(file.name).toBe('test1.png');
    expect(file.type).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('abc');
    expect(asset).toEqual({ id: 99, name: 'test1.png', path: 'https://x/y.png', parentFolderId: 7, size: 3 });
  });

  it('для кореня не шле parent_folder_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okAsset());
    vi.stubGlobal('fetch', fetchMock);
    await new CustomerApiClient(cfg).uploadFile({ ...input, parentFolderId: null });
    expect(((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData).has('parent_folder_id')).toBe(false);
  });

  it('мапить помилки, не повторює запит і не світить ключ', async () => {
    for (const status of [400, 404, 409, 413, 401, 500]) {
      const fetchMock = vi.fn().mockResolvedValue(new Response('x', { status }));
      vi.stubGlobal('fetch', fetchMock);
      const error = await new CustomerApiClient(cfg).uploadFile(input).catch((e: unknown) => e);
      expect(error, String(status)).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(KEY);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 409 })));
    await expect(new CustomerApiClient(cfg).uploadFile(input)).rejects.toThrow(/already exists/);
  });

  it('id не число → BadGateway (формат відповіді інший, ніж очікуємо)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ asset: { id: 'abc', path: 'p' } }), { status: 200 })));
    await expect(new CustomerApiClient(cfg).uploadFile(input)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('відсутні path/size/parent_folder_id → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ asset: { id: 5 } }), { status: 200 })));
    await expect(new CustomerApiClient(cfg).uploadFile(input)).resolves.toEqual({ id: 5, name: null, path: null, parentFolderId: null, size: null });
  });

  it('мережева помилка, невалідний JSON і відповідь без asset → BadGateway', async () => {
    for (const mock of [
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })),
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nothing: 1 }), { status: 200 })),
    ]) {
      vi.stubGlobal('fetch', mock);
      await expect(new CustomerApiClient(cfg).uploadFile(input)).rejects.toBeInstanceOf(BadGatewayException);
    }
  });
});

describe('uploadFilename', () => {
  it('дописує розширення за mimeType лише коли його немає', () => {
    expect(uploadFilename('124_en', 'image/png')).toBe('124_en.png');
    expect(uploadFilename('banner.png', 'image/png')).toBe('banner.png');
    expect(uploadFilename('BANNER.PNG', 'image/png')).toBe('BANNER.PNG');
    expect(uploadFilename('a.v2', 'image/png')).toBe('a.v2.png');
    expect(uploadFilename('photo.jpeg', 'image/jpeg')).toBe('photo.jpeg');
    expect(uploadFilename('photo', 'image/jpeg')).toBe('photo.jpg');
    expect(uploadFilename('x', 'application/octet-stream')).toBe('x.png');
  });
});
