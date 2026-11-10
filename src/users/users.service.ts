import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Role, type User } from '../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';

const BCRYPT_SALT_ROUNDS = 12;

const USER_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          password: passwordHash,
          role: dto.role,
        },
        select: USER_LIST_SELECT,
      });

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Username "${dto.username}" is already taken`);
      }

      throw error;
    }
  }

  findAll(): Promise<UserResponseDto[]> {
    return this.prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Змінює роль юзера. Забороняє прибрати роль admin в останнього адміна, щоб
   * не лишити систему без жодного адміністратора (створити юзерів і міняти
   * ролі тоді вже ніхто не зможе). Перевірка і запис в одній транзакції.
   * Нова роль потрапить у JWT лише після наступного логіну: токен несе роль
   * на момент видачі, а не читає її з БД.
   */
  async updateRole(id: string, role: Role): Promise<UserResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id }, select: { role: true } });
      if (!current) {
        throw new NotFoundException(`User "${id}" not found`);
      }

      if (current.role === Role.admin && role !== Role.admin) {
        const admins = await tx.user.count({ where: { role: Role.admin } });
        if (admins <= 1) {
          throw new ConflictException('Cannot change the role of the last admin');
        }
      }

      return tx.user.update({ where: { id }, data: { role }, select: USER_LIST_SELECT });
    });
  }

  async remove(id: string): Promise<void> {
    try {
      // Job.runnedById має onDelete: SetNull — видалення юзера просто
      // обнулить це поле в його job'ах, а не заблокується (на відміну від
      // Rule, де JobRule.ruleId має Restrict).
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User "${id}" not found`);
      }

      throw error;
    }
  }

  /** Повний запис із хешем пароля — лише для внутрішніх потреб (авторизація). */
  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }
}
