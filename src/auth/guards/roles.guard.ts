import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { JwtPayload } from '../types/jwt-payload.type.js';
import { Role } from '../../generated/prisma/client.js';

/**
 * Звіряє роль з payload токена зі списком, який вимагає @Roles(...).
 * Обов'язково ставити ПІСЛЯ JwtAuthGuard у @UseGuards — цей гард лише
 * читає request.user, який туди кладе саме JwtAuthGuard, сам токен не чіпає.
 * Якщо на ендпоінті немає @Roles(...) — пропускає всіх (авторизація "хто
 * завгодно залогінений" лишається на JwtAuthGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
