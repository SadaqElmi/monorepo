import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig } from 'pg';
import { normalizeTenancyMode, type TenancyMode } from '../tenant/tenant-status';

const MANAGED_PG_HOST_RE =
  /\.(?:supabase\.(?:co|com)|neon\.tech)\b/i;

function parseConnectionUrl(connectionString: string): URL | null {
  try {
    return new URL(connectionString.replace(/^postgresql:\/\//i, 'postgres://'));
  } catch {
    return null;
  }
}

/** libpq-compatible SSL options for node-pg (URL sslmode is not applied automatically). */
export function resolvePgSsl(
  connectionString: string,
): PoolConfig['ssl'] | undefined {
  const parsed = parseConnectionUrl(connectionString);
  const sslmode = parsed?.searchParams.get('sslmode')?.toLowerCase();

  if (sslmode === 'disable' || sslmode === 'false') {
    return false;
  }

  const strictVerify =
    process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true' ||
    process.env.PG_SSL_REJECT_UNAUTHORIZED === '1';

  if (sslmode === 'verify-ca' || sslmode === 'verify-full') {
    return { rejectUnauthorized: true };
  }

  if (sslmode === 'require' || sslmode === 'prefer') {
    return { rejectUnauthorized: strictVerify };
  }

  const host = parsed?.hostname ?? '';
  if (MANAGED_PG_HOST_RE.test(host) || MANAGED_PG_HOST_RE.test(connectionString)) {
    return { rejectUnauthorized: strictVerify };
  }

  return undefined;
}

/**
 * pg v8 treats sslmode=require as verify-full unless uselibpqcompat=true is set.
 * Apply when using relaxed certificate verification.
 */
export function normalizePgConnectionStringForPool(
  connectionString: string,
  ssl: PoolConfig['ssl'] | undefined,
): string {
  const parsed = parseConnectionUrl(connectionString);
  if (!parsed) return connectionString;

  const relaxedSsl =
    typeof ssl === 'object' &&
    ssl !== null &&
    'rejectUnauthorized' in ssl &&
    ssl.rejectUnauthorized === false;

  if (relaxedSsl && parsed.searchParams.get('uselibpqcompat') !== 'true') {
    parsed.searchParams.set('uselibpqcompat', 'true');
  }

  return parsed.toString().replace(/^postgres:\/\//i, 'postgresql://');
}

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
  opts: {
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  } = {},
): Pool {
  const ssl = resolvePgSsl(connectionString);
  const normalizedConnectionString = normalizePgConnectionStringForPool(
    connectionString,
    ssl,
  );
  return new Pool({
    connectionString: normalizedConnectionString,
    ...(ssl !== undefined ? { ssl } : {}),
    max: opts.max ?? 10,
    idleTimeoutMillis: opts.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: opts.connectionTimeoutMillis ?? 20_000,
  });
}

export function createPrismaPgFromPool(pool: Pool): PrismaPg {
  return new PrismaPg(pool);
}
