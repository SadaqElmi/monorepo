import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigin =
    process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:3001';
  app.enableCors({
    origin: corsOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'X-Tenant',
      'x-branch-id',
      'X-Idempotency-Key',
      'X-Correlation-Id',
      'X-Causation-Id',
      'Cookie',
      'Authorization',
    ],
    exposedHeaders: ['X-Idempotency-Replayed'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 5555);
}
bootstrap();
