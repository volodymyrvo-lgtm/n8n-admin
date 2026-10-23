import { randomBytes } from 'node:crypto';

/**
 * UUID v7 (RFC 9562): 48 біт unix-часу в мс + випадкові біти. Потрібен
 * тут, бо шлях файлу в Storage містить id банера, який відомий ДО запису в
 * БД (Prisma uuid(7) генерує id уже під час INSERT). Решта таблиць мають
 * той самий формат id, тож порядок за часом зберігається.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
