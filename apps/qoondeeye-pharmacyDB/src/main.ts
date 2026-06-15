import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Comma-separated list in `CORS_ORIGIN`. When unset, local Next apps (ERP :3000, POS :3001, admin :3002). */
function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (raw?.trim()) {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://pos.qoondeeye.online',
    'https://pharmcare.qoondeeye.online',
    'https://qoondeeye-admin.qoondeeye.online',
  ];
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );
  await app.register(compress);
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });
  const corsOrigins = getCorsOrigins();
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Accept',
      'Content-Type',
      'Authorization',
      'X-Tenant',
      'x-tenant',
      'X-Tenant-Subdomain',
      'x-tenant-subdomain',
      'x-branch-id',
      'X-Idempotency-Key',
      'x-request-id',
      'X-Request-Id',
      'x-correlation-id',
      'X-Correlation-Id',
    ],
  });
  console.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = Number(process.env.PORT ?? 5555);
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server running on port ${port}`);
}
void bootstrap();
