import type { TenantContextPayload } from './tenant.types';

export type TenantStorageHint = Pick<
  TenantContextPayload,
  'databaseUrlEncrypted' | 'usesDedicatedDatabase'
>;

/** True when the tenant row stores an encrypted dedicated-database connection URL. */
export function tenantHasDedicatedDatabase(
  tenant: TenantStorageHint | null | undefined,
): boolean {
  if (!tenant) return false;
  if (tenant.usesDedicatedDatabase === true) return true;
  return Boolean(tenant.databaseUrlEncrypted?.trim());
}

/** All tenants use dedicated PostgreSQL databases. */
export function resolveTenantStorageMode(): 'database' {
  return 'database';
}

/** Tenant ERP tables always live in the dedicated database `public` schema. */
export function tenantPhysicalSchema(
  _globalMode: 'database',
  _schemaName: string,
  _tenant?: TenantStorageHint | null,
): string {
  return 'public';
}

export function rewriteSchemaQualifiedSql(
  query: string,
  schemaName: string,
): string {
  const escapedSchema = schemaName.replace(/"/g, '""');
  const schemaPrefix = `"${escapedSchema}".`;
  const publicPrefix = '"public".';
  return query.split(schemaPrefix).join(publicPrefix);
}
