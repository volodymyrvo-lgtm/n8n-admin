import { ValidationPipe } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UsersService } from './users.service.js';

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

describe('UpdateUserRoleDto', () => {
  const parseRole = (plain: object) =>
    pipe.transform(plain, { type: 'body', metatype: UpdateUserRoleDto }) as Promise<UpdateUserRoleDto>;

  it.each(['admin', 'user', 'reader', 'analyst'])('приймає роль %s', async (role) => {
    await expect(parseRole({ role })).resolves.toMatchObject({ role });
  });

  it('роль обов\'язкова, невідома роль і зайві поля відхиляються', async () => {
    await expect(parseRole({})).rejects.toThrow();
    await expect(parseRole({ role: 'superuser' })).rejects.toThrow();
    await expect(parseRole({ role: 'user', username: 'x@y.z' })).rejects.toThrow();
  });
});

describe('UsersService.updateRole', () => {
  function makeService(current: { role: Role } | null, admins = 2) {
    const findUnique = vi.fn().mockResolvedValue(current);
    const count = vi.fn().mockResolvedValue(admins);
    const update = vi.fn((args: { data: { role: Role } }) => Promise.resolve({ id: 'u1', ...args.data }));
    const tx = { user: { findUnique, count, update } };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { service: new UsersService(prisma as never), update, count };
  }

  it('змінює роль і повертає юзера', async () => {
    const { service, update } = makeService({ role: Role.user });
    await expect(service.updateRole('u1', Role.analyst)).resolves.toMatchObject({ role: Role.analyst });
    expect(update).toHaveBeenCalledOnce();
  });

  it('404, якщо юзера немає', async () => {
    const { service, update } = makeService(null);
    await expect(service.updateRole('u1', Role.user)).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('409, якщо знімають admin з останнього адміна', async () => {
    const { service, update } = makeService({ role: Role.admin }, 1);
    await expect(service.updateRole('u1', Role.user)).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('знімає admin, якщо є інший адмін', async () => {
    const { service } = makeService({ role: Role.admin }, 2);
    await expect(service.updateRole('u1', Role.reader)).resolves.toMatchObject({ role: Role.reader });
  });

  it('admin → admin не перевіряє кількість адмінів', async () => {
    const { service, count } = makeService({ role: Role.admin }, 1);
    await service.updateRole('u1', Role.admin);
    expect(count).not.toHaveBeenCalled();
  });
});
