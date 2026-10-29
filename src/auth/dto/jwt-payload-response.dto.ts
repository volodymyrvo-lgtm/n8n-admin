import type { Role } from '../../generated/prisma/client.js';

/** Вміст JWT, який повертає GET /auth/me. */
export class JwtPayloadResponseDto {
  /** id користувача */
  sub!: string;
  username!: string;
  role!: Role;
}
