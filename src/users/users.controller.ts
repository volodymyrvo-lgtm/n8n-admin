import {
  Controller,
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Створювати юзерів (у т.ч. з роллю admin) може тільки вже залогінений admin. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  /**
   * Зміна ролі юзера (тільки admin). Тіло: { role }. 404 — юзера немає, 409 —
   * це останній admin. Нова роль діє після наступного логіну юзера.
   */
  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserRoleDto): Promise<UserResponseDto> {
    return this.usersService.updateRole(id, dto.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
