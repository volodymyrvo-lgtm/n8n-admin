import type { JwtPayload } from './jwt-payload.type.js';

declare global {
  namespace Express {
    interface Request {
      /** Заповнюється JwtAuthGuard-ом після успішної перевірки токена. */
      user?: JwtPayload;
    }
  }
}
