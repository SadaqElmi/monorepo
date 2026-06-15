import 'reflect-metadata';

process.env.RATE_LIMIT_ENABLED = 'false';
process.env.TENANT_DATABASE_URL_ENCRYPTION_KEY =
  process.env.TENANT_DATABASE_URL_ENCRYPTION_KEY ?? 'a'.repeat(64);
