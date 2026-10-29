import 'reflect-metadata';
import { RequestMethod, type INestApplication, type Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ROLES_KEY } from './auth/decorators/roles.decorator.js';
import { ApiKeyGuard } from './auth/guards/api-key.guard.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';

/** Імена схем безпеки в документі. */
export const BEARER_SCHEME = 'bearer';
export const API_KEY_SCHEME = 'api-key';

const DESCRIPTION = `
REST API бекенду n8n-admin.

**Авторизація**
- Звичайні маршрути для фронта: \`Authorization: Bearer <JWT>\`. Токен дає \`POST /auth/login\`. Кнопка **Authorize** вгорі сторінки.
- Маршрути для n8n: заголовок \`X-API-Key: <ключ>\` (без ролей).
- Біля кожного маршруту видно замок і, якщо доступ обмежений, список ролей (admin, user, reader, analyst).

**Помилки** мають вигляд \`{ "statusCode": 400, "message": "...", "error": "Bad Request" }\`; при помилках валідації \`message\` це масив рядків.

**Real-time:** оновлення джоб надсилаються через Socket.IO (подія оновлення джоби), у Swagger вони не відображаються.
`.trim();

/**
 * Збирає OpenAPI-документ і доповнює його тим, що Nest не може вивести сам:
 * теги за контролерами, схему безпеки та ролі беруться з гардів і @Roles
 * реальних маршрутів, тож не розходяться з кодом.
 */
export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('n8n-admin API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT з POST /auth/login' }, BEARER_SCHEME)
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header', description: 'Ключ для n8n' }, API_KEY_SCHEME)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  applyGuardInfo(document, collectControllers(app));
  return document;
}

/** Підключає Swagger UI на /docs і JSON на /docs-json. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildSwaggerDocument(app), {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
  });
}

function collectControllers(app: INestApplication): Type<unknown>[] {
  const container = app.get(ModulesContainer);
  const controllers = new Set<Type<unknown>>();
  for (const module of container.values()) {
    for (const wrapper of module.controllers.values()) {
      if (wrapper.metatype) {
        controllers.add(wrapper.metatype as Type<unknown>);
      }
    }
  }
  return [...controllers];
}

interface OperationInfo {
  tag: string;
  jwt: boolean;
  apiKey: boolean;
  roles: readonly string[] | undefined;
}

type Handler = (...args: never[]) => unknown;
type Operation = NonNullable<OpenAPIObject['paths'][string][keyof OpenAPIObject['paths'][string] & string]> & {
  operationId?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  description?: string;
  requestBody?: unknown;
  responses?: Record<string, { description: string }>;
};

/** operationId → що відомо про маршрут із метаданих контролера. */
function describeRoutes(controllers: Type<unknown>[]): Map<string, OperationInfo> {
  const routes = new Map<string, OperationInfo>();

  for (const controller of controllers) {
    const basePath = (Reflect.getMetadata('path', controller) as string | undefined) ?? '';
    const classGuards = (Reflect.getMetadata('__guards__', controller) as unknown[] | undefined) ?? [];

    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as unknown as Record<string, unknown>)[name] as Handler;
      if (name === 'constructor' || typeof handler !== 'function' || Reflect.getMetadata('method', handler) === undefined) {
        continue;
      }

      const guards = [...classGuards, ...((Reflect.getMetadata('__guards__', handler) as unknown[] | undefined) ?? [])];
      const roles = (Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, controller)) as readonly string[] | undefined;

      routes.set(`${controller.name}_${name}`, {
        tag: basePath === '' || basePath === '/' ? 'app' : basePath,
        jwt: guards.includes(JwtAuthGuard),
        apiKey: guards.includes(ApiKeyGuard),
        roles: roles && roles.length > 0 ? roles : undefined,
      });
    }
  }

  return routes;
}

const HTTP_METHODS = new Set(Object.keys(RequestMethod).filter((key) => Number.isNaN(Number(key))).map((key) => key.toLowerCase()));

export function applyGuardInfo(document: OpenAPIObject, controllers: Type<unknown>[]): void {
  const routes = describeRoutes(controllers);

  for (const pathItem of Object.values(document.paths)) {
    for (const [method, raw] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      const operation = raw as Operation;
      const info = operation.operationId ? routes.get(operation.operationId) : undefined;
      if (!info) {
        continue;
      }

      operation.tags = [info.tag];
      operation.responses ??= {};

      if (info.jwt) {
        operation.security = [{ [BEARER_SCHEME]: [] }];
        operation.responses['401'] ??= { description: 'Немає токена або він недійсний' };
      } else if (info.apiKey) {
        operation.security = [{ [API_KEY_SCHEME]: [] }];
        operation.responses['401'] ??= { description: 'Відсутній або хибний X-API-Key' };
      }

      if (info.roles) {
        operation.description = `**Ролі:** ${info.roles.join(', ')}\n\n${operation.description ?? ''}`.trim();
        operation.responses['403'] ??= { description: 'Роль користувача не має доступу' };
      }

      const parameters = (operation as { parameters?: Array<{ in?: string }> }).parameters ?? [];
      if (parameters.some((parameter) => parameter.in === 'path')) {
        operation.responses['404'] ??= { description: 'Запис не знайдено' };
      }

      if (operation.requestBody !== undefined || (Array.isArray((operation as { parameters?: unknown[] }).parameters) && (operation as { parameters?: unknown[] }).parameters!.length > 0)) {
        operation.responses['400'] ??= { description: 'Помилка валідації запиту' };
      }
    }
  }
}
