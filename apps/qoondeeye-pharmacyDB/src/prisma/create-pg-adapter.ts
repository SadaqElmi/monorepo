import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

/** Render/production uses DATABASE_URL; local dev often uses DATABASE_URL_STAGING / DATABASE_URL_LOCAL. */
export function resolveDatabaseUrl(config?: ConfigService): string | undefined {
  if (config) {
    return (
      config.get<string>('DATABASE_URL') ??
      process.env.DATABASE_URL ??
      config.get<string>('DATABASE_URL_STAGING') ??
      process.env.DATABASE_URL_STAGING ??
      config.get<string>('DATABASE_URL_LOCAL') ??
      process.env.DATABASE_URL_LOCAL
    );
  }
  return (
    process.env.DATABASE_URL ??
    process.env.DATABASE_URL_STAGING ??
    process.env.DATABASE_URL_LOCAL
  );
}

/** Shared tuning for API + scripts (explicit pool; URL query params do not control these). */
export function createPgPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
  });
}

export function createPrismaPgFromPool(pool: Pool): PrismaPg {
  return new PrismaPg(pool);
}
