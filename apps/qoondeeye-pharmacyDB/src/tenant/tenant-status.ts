export type TenancyMode = 'database';

export const TENANT_STATUSES = [
  'pending_setup',
  'active',
  'suspended',
  'inactive',
  'provisioning_failed',
  'migration_failed',
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_PROVISIONING_STATUSES = [
  'pending_setup',
  'db_created',
  'user_created',
  'migrated',
  'seeded',
  'owner_created',
  'health_checked',
  'active',
  'failed',
] as const;
export type TenantProvisioningStatus =
  (typeof TENANT_PROVISIONING_STATUSES)[number];

export const RESERVED_TENANT_SUBDOMAINS = new Set([
  'admin',
  'api',
  'www',
  'app',
  'support',
  'docs',
]);

export function normalizeTenancyMode(_value?: string | undefined): TenancyMode {
  return 'database';
}

export function isActiveTenantStatus(status: string | null | undefined): boolean {
  return status === 'active';
}
