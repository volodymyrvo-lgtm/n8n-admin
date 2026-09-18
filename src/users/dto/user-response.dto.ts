import { Role } from '../../generated/prisma/client.js';

/** Те, що безпечно повертати назовні — без хеша пароля. */
export class UserResponseDto {
  id!: string;
  username!: string;
  role!: Role;
  createdAt!: Date;
  updatedAt!: Date;
}
