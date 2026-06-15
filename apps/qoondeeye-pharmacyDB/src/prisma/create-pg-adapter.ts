import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { normalizeTenancyMode, type TenancyMode } from '../tenant/tenant-status';

/** DATABASE_URL from the active env profile (.env cloud / .env.local). */
export function resolveDatabaseUrl(config?: ConfigService): string | undefined {
  if (config) {
    return (
      config.get<string>('CONTROL_DATABASE_URL') ??
      process.env.CONTROL_DATABASE_URL ??
      config.get<string>('DATABASE_URL') ??
      process.env.DATABASE_URL
    );
  }
  return process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
}

export function resolveTenancyMode(config?: ConfigService): TenancyMode {
  return normalizeTenancyMode(
    config?.get<string>('TENANCY_MODE') ?? process.env.TENANCY_MODE,
  );
}

export function resolveTenantPoolMax(config?: ConfigService): number {
  const raw =
    config?.get<string>('TENANT_DB_POOL_MAX') ?? process.env.TENANT_DB_POOL_MAX;
  const parsed = raw ? Number.parseInt(raw, 10) : 3;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

/** Shared tuning for API + scripts (explicit pool; URL query params do not control these). */
export function createPgPool(
  connectionString: string,
  opts: { max?: number } = {},
): Pool {
  return new Pool({
    connectionString,
    max: opts.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
  });
}

export function createPrismaPgFromPool(pool: Pool): PrismaPg {
  return new PrismaPg(pool);
}
