import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Для машинних клієнтів (n8n), яким незручно проходити через JWT-логін і
 * стежити за протермінуванням токена. Перевіряє статичний ключ у заголовку
 * X-API-Key, звірюючи його constant-time (щоб не витікала інформація через
 * час порівняння — той самий принцип, що й у AuthService.login).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-api-key'];
    const expected = this.config.getOrThrow<string>('N8N_API_KEY');

    if (typeof provided !== 'string' || !ApiKeyGuard.isValidKey(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }

  private static isValidKey(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
