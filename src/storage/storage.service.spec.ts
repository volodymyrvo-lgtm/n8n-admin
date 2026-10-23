import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { readStorageConfig } from './storage.config.js';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, StorageService } from './storage.service.js';

const BUCKET = 'banners_test';

function makeService() {
  const bucket = {
    upload: vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/x?token=t' }, error: null }),
    createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const from = vi.fn().mockReturnValue(bucket);
  const client = { storage: { from } };
  const config = {
    get: (key: string) => ({ SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_x', SUPABASE_BANNERS_BUCKET: BUCKET })[key],
  };
  const service = new StorageService(client as never, config as never);
  return { service, bucket, from };
}

describe('readStorageConfig', () => {
  const base = { SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SERVICE_KEY: 'key', SUPABASE_BANNERS_BUCKET: 'b' };
  const read = (env: Record<string, string | undefined>) => readStorageConfig({ get: ((k: string) => env[k]) as never });

  it('повертає конфіг і прибирає зайві слеші та пробіли', () => {
    expect(read({ ...base, SUPABASE_URL: ' https://ref.supabase.co/ ' })).toEqual({
      url: 'https://ref.supabase.co',
      serviceKey: 'key',
      bucket: 'b',
    });
  });

  it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_BANNERS_BUCKET'])('кидає, якщо %s відсутня або порожня', (key) => {
    expect(() => read({ ...base, [key]: undefined })).toThrow(key);
    expect(() => read({ ...base, [key]: '  ' })).toThrow(key);
  });

  it('відхиляє адресу REST API замість кореня проєкту', () => {
    expect(() => read({ ...base, SUPABASE_URL: 'https://ref.supabase.co/rest/v1/' })).toThrow('without /rest/v1');
  });

  it('відхиляє не-URL', () => {
    expect(() => read({ ...base, SUPABASE_URL: 'not a url' })).toThrow('not a valid URL');
  });
});

describe('StorageService.buildPath', () => {
  it('дає унікальний шлях <bannerId>/<uuid>.png щоразу', () => {
    const { service } = makeService();
    const a = service.buildPath('banner-1');
    const b = service.buildPath('banner-1');
    expect(a).toMatch(/^banner-1\/[0-9a-f-]{36}\.png$/);
    expect(a).not.toBe(b);
  });

  it('відхиляє небезпечні bannerId та розширення (path traversal)', () => {
    const { service } = makeService();
    expect(() => service.buildPath('../etc')).toThrow();
    expect(() => service.buildPath('a/b')).toThrow();
    expect(() => service.buildPath('banner-1', 'p/ng')).toThrow();
  });
});

describe('StorageService.upload', () => {
  it('завантажує в налаштований бакет без перезапису за замовчуванням', async () => {
    const { service, bucket, from } = makeService();
    const body = Buffer.from([1]);
    await service.upload('b/1.png', body, { contentType: 'image/png' });
    expect(from).toHaveBeenCalledWith(BUCKET);
    expect(bucket.upload).toHaveBeenCalledWith('b/1.png', body, { contentType: 'image/png', upsert: false });
  });

  it('upsert можна ввімкнути явно', async () => {
    const { service, bucket } = makeService();
    await service.upload('b/1.png', Buffer.from([1]), { contentType: 'image/png', upsert: true });
    expect(bucket.upload).toHaveBeenCalledWith('b/1.png', expect.anything(), { contentType: 'image/png', upsert: true });
  });

  it('існуючий файл → ConflictException', async () => {
    const { service, bucket } = makeService();
    bucket.upload.mockResolvedValue({ data: null, error: { message: 'The resource already exists', statusCode: '409' } });
    await expect(service.upload('b/1.png', Buffer.from([1]), { contentType: 'image/png' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('інша помилка → 500 без витоку тексту Supabase', async () => {
    const { service, bucket } = makeService();
    bucket.upload.mockResolvedValue({ data: null, error: { message: 'secret internal detail', statusCode: '500' } });
    const err = await service.upload('b/1.png', Buffer.from([1]), { contentType: 'image/png' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect((err as Error).message).not.toContain('secret internal detail');
  });
});

describe('StorageService.createSignedUrl', () => {
  it('повертає URL і за замовчуванням ставить TTL 10 хвилин', async () => {
    const { service, bucket } = makeService();
    await expect(service.createSignedUrl('b/1.png')).resolves.toBe('https://signed.example/x?token=t');
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('b/1.png', DEFAULT_SIGNED_URL_TTL_SECONDS);
    expect(DEFAULT_SIGNED_URL_TTL_SECONDS).toBe(600);
  });

  it('неіснуючий файл → NotFoundException', async () => {
    const { service, bucket } = makeService();
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found', statusCode: '404' } });
    await expect(service.createSignedUrl('b/x.png')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StorageService.createSignedUrls', () => {
  it('порожній список не робить запиту', async () => {
    const { service, bucket } = makeService();
    await expect(service.createSignedUrls([])).resolves.toEqual(new Map());
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
  });

  it('повертає мапу шлях → URL одним запитом; помилка окремого файлу дає null', async () => {
    const { service, bucket } = makeService();
    bucket.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a/1.png', signedUrl: 'https://s/a', error: null },
        { path: 'b/2.png', signedUrl: '', error: 'Object not found' },
      ],
      error: null,
    });

    const result = await service.createSignedUrls(['a/1.png', 'b/2.png']);

    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(['a/1.png', 'b/2.png'], DEFAULT_SIGNED_URL_TTL_SECONDS);
    expect(result.get('a/1.png')).toBe('https://s/a');
    expect(result.get('b/2.png')).toBeNull();
  });

  it('збій усього запиту → 500', async () => {
    const { service, bucket } = makeService();
    bucket.createSignedUrls.mockResolvedValue({ data: null, error: { message: 'boom', statusCode: '500' } });
    await expect(service.createSignedUrls(['a/1.png'])).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('StorageService.download', () => {
  it('повертає Buffer із байтами файлу', async () => {
    const { service } = makeService();
    const result = await service.download('b/1.png');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
  });

  it('неіснуючий файл → NotFoundException, інша помилка → 500', async () => {
    const { service, bucket } = makeService();
    bucket.download.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(service.download('b/x.png')).rejects.toBeInstanceOf(NotFoundException);
    bucket.download.mockResolvedValue({ data: null, error: { message: 'boom', statusCode: '500' } });
    await expect(service.download('b/x.png')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('StorageService.remove', () => {
  it('видаляє файл за шляхом', async () => {
    const { service, bucket } = makeService();
    await service.remove('b/1.png');
    expect(bucket.remove).toHaveBeenCalledWith(['b/1.png']);
  });

  it('відсутній файл — не помилка (ідемпотентність)', async () => {
    const { service, bucket } = makeService();
    bucket.remove.mockResolvedValue({ data: null, error: { message: 'Object not found', statusCode: '404' } });
    await expect(service.remove('b/1.png')).resolves.toBeUndefined();
  });

  it('інша помилка → 500', async () => {
    const { service, bucket } = makeService();
    bucket.remove.mockResolvedValue({ data: null, error: { message: 'boom', statusCode: '500' } });
    await expect(service.remove('b/1.png')).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('removeMany: пакет одним запитом, порожній список запиту не робить', async () => {
    const { service, bucket } = makeService();
    await service.removeMany([]);
    expect(bucket.remove).not.toHaveBeenCalled();
    await service.removeMany(['a/1.png', 'b/2.png']);
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(bucket.remove).toHaveBeenCalledWith(['a/1.png', 'b/2.png']);
  });
});
