import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

/** Позначає ендпоінт як доступний тільки для перелічених ролей. Використовувати разом з RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
