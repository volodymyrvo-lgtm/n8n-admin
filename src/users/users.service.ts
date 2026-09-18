import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, type User } from '../generated/prisma/client.js';
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
