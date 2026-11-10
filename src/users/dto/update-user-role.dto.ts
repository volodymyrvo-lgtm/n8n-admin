import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/client.js';

/** Тіло PATCH /users/:id/role. Роль обов'язкова: інших полів юзера цей роут не міняє. */
export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}
