import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppController } from './app.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { BannersController } from './banners/banners.controller.js';
import { CustomerFoldersController } from './customer-folders/customer-folders.controller.js';
import { GlossariesController } from './glossaries/glossaries.controller.js';
import { JobErrorsController } from './job-errors/job-errors.controller.js';
import { JobsController } from './jobs/jobs.controller.js';
import { LlmUsageController } from './llm-usage/llm-usage.controller.js';
import { PromptsController } from './prompts/prompts.controller.js';
import { RulesController } from './rules/rules.controller.js';
import { API_KEY_SCHEME, BEARER_SCHEME, buildSwaggerDocument } from './swagger.js';
import { UsersController } from './users/users.controller.js';

type Operation = {
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  description?: string;
  responses?: Record<string, unknown>;
};

let app: INestApplication;
let operations: Map<string, Operation>;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [
      AppController,
      AuthController,
      UsersController,
      JobsController,
      JobErrorsController,
      BannersController,
      CustomerFoldersController,
      LlmUsageController,
      RulesController,
      PromptsController,
      GlossariesController,
    ],
  })
    .useMocker(() => ({}))
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();

  const document = buildSwaggerDocument(app);
  operations = new Map();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      operations.set(`${method.toUpperCase()} ${path}`, operation as Operation);
    }
  }
});

afterAll(async () => {
  await app.close();
});

describe('Swagger-документ', () => {
  it('містить маршрути всіх контролерів, і кожен має тег', () => {
    expect(operations.size).toBeGreaterThan(40);
    for (const [key, operation] of operations) {
      expect(operation.tags?.length, key).toBe(1);
    }
    const tags = new Set([...operations.values()].map((operation) => operation.tags![0]));
    for (const tag of ['auth', 'users', 'jobs', 'job-errors', 'banners', 'customer-folders', 'llm-usage', 'rules', 'prompts', 'glossaries']) {
      expect(tags.has(tag), tag).toBe(true);
    }
  });

  it('схема безпеки береться з гардів: JWT, X-API-Key або публічно', () => {
    expect(operations.get('GET /banners')!.security).toEqual([{ [BEARER_SCHEME]: [] }]);
    expect(operations.get('GET /jobs/{id}')!.security).toEqual([{ [BEARER_SCHEME]: [] }]);
    expect(operations.get('POST /banners')!.security).toEqual([{ [API_KEY_SCHEME]: [] }]);
    expect(operations.get('PATCH /jobs/{id}')!.security).toEqual([{ [API_KEY_SCHEME]: [] }]);
    expect(operations.get('POST /customer-folders/sync')!.security).toEqual([{ [API_KEY_SCHEME]: [] }]);
    expect(operations.get('POST /auth/login')!.security).toBeUndefined();
  });

  it('ролі з @Roles потрапляють в опис і дають 403', () => {
    const send = operations.get('POST /banners/send')!;
    expect(send.description).toContain('**Ролі:** admin');
    expect(send.responses).toHaveProperty('403');

    const createJob = operations.get('POST /jobs')!;
    expect(createJob.description).toContain('admin, user');

    expect(operations.get('GET /banners')!.description ?? '').not.toContain('Ролі');
    expect(operations.get('GET /banners')!.responses).not.toHaveProperty('403');
  });

  it('401 є в усіх захищених маршрутів, 404 у маршрутів із параметром шляху', () => {
    for (const [key, operation] of operations) {
      if (operation.security) {
        expect(operation.responses, key).toHaveProperty('401');
      }
    }
    expect(operations.get('GET /jobs/{id}')!.responses).toHaveProperty('404');
    expect(operations.get('GET /jobs')!.responses).not.toHaveProperty('404');
  });
});
