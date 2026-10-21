import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { GlossariesController } from '../glossaries/glossaries.controller.js';
import { Role } from '../generated/prisma/client.js';
import { JobErrorsController } from '../job-errors/job-errors.controller.js';
import { JobsController } from '../jobs/jobs.controller.js';
import { LlmUsageController } from '../llm-usage/llm-usage.controller.js';
import { PromptsController } from '../prompts/prompts.controller.js';
import { RulesController } from '../rules/rules.controller.js';
import { UsersController } from '../users/users.controller.js';
import { ROLES_KEY } from './decorators/roles.decorator.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

type Handler = (...args: never[]) => unknown;

interface Route {
  key: string;
  method: string;
  /** undefined = будь-який залогінений (немає @Roles). */
  roles: readonly Role[] | undefined;
  guards: unknown[];
  jwt: boolean;
}

const CONTROLLERS = [
  UsersController,
  JobsController,
  JobErrorsController,
  LlmUsageController,
  RulesController,
  PromptsController,
  GlossariesController,
] as const;

function collectRoutes(): Route[] {
  const routes: Route[] = [];

  for (const controller of CONTROLLERS) {
    const basePath = Reflect.getMetadata('path', controller) as string;
    const classGuards = (Reflect.getMetadata('__guards__', controller) as unknown[] | undefined) ?? [];

    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as unknown as Record<string, unknown>)[name] as Handler;
      if (name === 'constructor' || typeof handler !== 'function') continue;

      const methodId = Reflect.getMetadata('method', handler) as number | undefined;
      if (methodId === undefined) continue;

      const subPath = (Reflect.getMetadata('path', handler) as string) === '/' ? '' : `/${Reflect.getMetadata('path', handler) as string}`;
      const guards = [...classGuards, ...((Reflect.getMetadata('__guards__', handler) as unknown[] | undefined) ?? [])];
      const roles = (Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, controller)) as
        | readonly Role[]
        | undefined;

      routes.push({
        key: `${RequestMethod[methodId]} /${basePath}${subPath}`,
        method: RequestMethod[methodId]!,
        roles,
        guards,
        jwt: guards.includes(JwtAuthGuard),
      });
    }
  }

  return routes;
}

const routes = collectRoutes();
const jwtRoutes = routes.filter((route) => route.jwt);

function canCall(role: Role, route: Route): boolean {
  return route.roles === undefined || route.roles.length === 0 || route.roles.includes(role);
}

describe('Матриця ролей', () => {
  it('знаходить маршрути контролерів (захист від порожнього тесту)', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(jwtRoutes.length).toBeGreaterThan(10);
  });

  it('@Roles без RolesGuard нічого не захищає — гард має стояти на кожному маршруті з ролями', () => {
    for (const route of routes.filter((r) => r.roles !== undefined)) {
      expect(route.guards, route.key).toContain(RolesGuard);
    }
  });

  it('маршрути для n8n (X-API-Key) не залежать від ролей', () => {
    const apiKeyRoutes = routes.filter((route) => route.guards.includes(ApiKeyGuard)).map((route) => route.key);
    expect(apiKeyRoutes.sort()).toEqual(
      ['PATCH /jobs/:id', 'POST /job-errors', 'POST /llm-usage'].sort(),
    );
    for (const route of routes.filter((r) => r.guards.includes(ApiKeyGuard))) {
      expect(route.roles, route.key).toBeUndefined();
    }
  });

  it.each([Role.reader, Role.analyst])('%s не може викликати жоден JWT-маршрут, що змінює дані', (role) => {
    for (const route of jwtRoutes.filter((r) => r.method !== 'GET')) {
      expect(canCall(role, route), `${role} → ${route.key}`).toBe(false);
    }
  });

  it('reader читає джоби, правила, промпти й глосарії, але не витрати та помилки', () => {
    const allowed = (key: string) => canCall(Role.reader, routes.find((r) => r.key === key)!);

    expect(allowed('GET /jobs')).toBe(true);
    expect(allowed('GET /rules')).toBe(true);
    expect(allowed('GET /prompts')).toBe(true);
    expect(allowed('GET /glossaries')).toBe(true);

    expect(allowed('GET /llm-usage')).toBe(false);
    expect(allowed('GET /llm-usage/summary')).toBe(false);
    expect(allowed('GET /llm-usage/filters')).toBe(false);
    expect(allowed('GET /job-errors')).toBe(false);
  });

  it('analyst додатково бачить дашборд витрат і помилки, але нічого не створює', () => {
    const allowed = (key: string) => canCall(Role.analyst, routes.find((r) => r.key === key)!);

    for (const key of ['GET /jobs', 'GET /rules', 'GET /prompts', 'GET /llm-usage', 'GET /llm-usage/summary', 'GET /llm-usage/filters', 'GET /job-errors']) {
      expect(allowed(key), key).toBe(true);
    }
    expect(allowed('POST /jobs')).toBe(false);
    expect(allowed('POST /jobs/seo')).toBe(false);
  });

  it('user створює джоби (як і раніше), але не адмінські операції', () => {
    const allowed = (key: string) => canCall(Role.user, routes.find((r) => r.key === key)!);

    expect(allowed('POST /jobs')).toBe(true);
    expect(allowed('POST /jobs/seo')).toBe(true);
    expect(allowed('GET /llm-usage/summary')).toBe(true);
    expect(allowed('GET /job-errors')).toBe(true);

    expect(allowed('DELETE /jobs')).toBe(false);
    expect(allowed('POST /rules')).toBe(false);
    expect(allowed('POST /rules/seo')).toBe(false);
    expect(allowed('POST /prompts')).toBe(false);
  });

  it('admin має доступ до всіх JWT-маршрутів', () => {
    for (const route of jwtRoutes) {
      expect(canCall(Role.admin, route), route.key).toBe(true);
    }
  });
});
