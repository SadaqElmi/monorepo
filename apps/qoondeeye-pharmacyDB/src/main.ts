import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://qoondeeye.online',
  'https://www.qoondeeye.online',
];

function normalizeOriginHeader(origin: string): string {
  return origin.replace(/\/$/, '');
}

function isWildcardOrigin(origin: string): boolean {
  return origin.includes('*');
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function buildCorsOptions(): CorsOptions {
  const raw = process.env.CORS_ORIGIN?.trim();
  const list = raw
    ? raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : DEFAULT_CORS_ORIGINS;
  const normalized = list.map(normalizeOriginHeader);
  const exactAllowed = new Set(
    normalized.filter((origin) => !isWildcardOrigin(origin)),
  );
  const wildcardAllowed = normalized
    .filter((origin) => isWildcardOrigin(origin))
    .map(wildcardToRegExp);

  return {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = normalizeOriginHeader(origin);
      const ok =
        exactAllowed.has(normalizedOrigin) ||
        wildcardAllowed.some((pattern) => pattern.test(normalizedOrigin));
      return callback(null, ok);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86_400,
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Accept-Language',
      'X-Tenant',
      'x-branch-id',
      'X-Branch-Id',
      'X-Idempotency-Key',
      'X-Correlation-Id',
      'X-Causation-Id',
      'Cookie',
      'Authorization',
    ],
    exposedHeaders: ['X-Idempotency-Replayed'],
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(buildCorsOptions());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 5555, '0.0.0.0');
  console.log(`🚀 Server running on port ${process.env.PORT ?? 5555}`);
}
void bootstrap();
