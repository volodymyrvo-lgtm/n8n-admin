import { Role } from '../../generated/prisma/client.js';

export interface JwtPayload {
  /** id користувача */
  sub: string;
  username: string;
  role: Role;
}
