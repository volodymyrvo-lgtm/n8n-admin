import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Role } from '../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function parse(plain: object): Promise<CreateUserDto> {
  return pipe.transform(plain, { type: 'body', metatype: CreateUserDto }) as Promise<CreateUserDto>;
}

const BASE = { username: 'user@royale.team', password: 'password123' };

describe('CreateUserDto — ролі', () => {
  it.each(['admin', 'user', 'reader', 'analyst'])('приймає роль %s', async (role) => {
    await expect(parse({ ...BASE, role })).resolves.toMatchObject({ role });
  });

  it('exposes reader та analyst у enum Role', () => {
    expect(Role.reader).toBe('reader');
    expect(Role.analyst).toBe('analyst');
  });

  it('роль необов\'язкова, але невідома роль відхиляється', async () => {
    await expect(parse(BASE)).resolves.toBeDefined();
    await expect(parse({ ...BASE, role: 'superuser' })).rejects.toThrow();
  });
});
