import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Comma-separated list in `CORS_ORIGIN`. When unset, local Next apps (ERP :3000, POS :3001). */
function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (raw?.trim()) {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return ['http://localhost:3000', 'http://localhost:3001'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
      'x-branch-id',
      'X-Idempotency-Key',
    ],
  });
  console.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);
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
