import type { ConfigService } from '@nestjs/config';

/**
 * Managed Postgres (Neon, etc.) cannot CREATE ROLE / ALTER OWNER per tenant.
 * Use one admin login; isolate tenants by database name only.
 */
export function usesSharedDatabaseOwner(config?: ConfigService): boolean {
  const flag =
    config?.get<string>('TENANT_DB_SHARED_OWNER') ??
    process.env.TENANT_DB_SHARED_OWNER;
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;

  const adminUrl =
    config?.get<string>('TENANT_DB_ADMIN_URL')?.trim() ??
    process.env.TENANT_DB_ADMIN_URL?.trim() ??
    '';
  return /\.neon\.tech\b/i.test(adminUrl);
}
