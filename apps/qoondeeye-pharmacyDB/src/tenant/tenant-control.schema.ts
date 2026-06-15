import type { TenantDbExecutor } from './tenant-control.repository';

const OPTIONAL_COLUMNS: Array<{ column: string; select: string }> = [
  { column: 'slug', select: 'slug' },
  { column: 'subdomain', select: 'subdomain' },
  { column: 'custom_domain', select: 'custom_domain AS "customDomain"' },
  { column: 'database_name', select: 'database_name AS "databaseName"' },
  {
    column: 'database_url_encrypted',
    select: 'database_url_encrypted AS "databaseUrlEncrypted"',
  },
  {
    column: 'provisioning_status',
    select: 'provisioning_status AS "provisioningStatus"',
  },
  {
    column: 'provisioning_lock_id',
    select: 'provisioning_lock_id AS "provisioningLockId"',
  },
  {
    column: 'provisioning_started_at',
    select: 'provisioning_started_at AS "provisioningStartedAt"',
  },
  { column: 'owner_user_id', select: 'owner_user_id AS "ownerUserId"' },
  { column: 'owner_name', select: 'owner_name AS "ownerName"' },
  { column: 'owner_email', select: 'owner_email AS "ownerEmail"' },
  { column: 'last_login_at', select: 'last_login_at AS "lastLoginAt"' },
  {
    column: 'database_health_status',
    select: 'database_health_status AS "databaseHealthStatus"',
  },
  {
    column: 'migration_status',
    select: 'migration_status AS "migrationStatus"',
  },
  {
    column: 'storage_used_bytes',
    select: 'storage_used_bytes AS "storageUsedBytes"',
  },
  { column: 'last_backup_at', select: 'last_backup_at AS "lastBackupAt"' },
  { column: 'error_message', select: 'error_message AS "errorMessage"' },
  { column: 'deleted_at', select: 'deleted_at AS "deletedAt"' },
  {
    column: 'scheduled_delete_at',
    select: 'scheduled_delete_at AS "scheduledDeleteAt"',
  },
  { column: 'created_at', select: 'created_at AS "createdAt"' },
  { column: 'updated_at', select: 'updated_at AS "updatedAt"' },
];

type TenantTableRef = '"Tenant"' | '"tenants"';

let cachedTableRef: TenantTableRef | null = null;
let cachedColumns: Set<string> | null = null;
let cachedSelect: string | null = null;

export async function resolveTenantControlTableRef(
  db: TenantDbExecutor,
): Promise<TenantTableRef> {
  if (cachedTableRef) return cachedTableRef;

  const rows = await db.$queryRawUnsafe<Array<{ relname: string }>>(
    `SELECT c.relname
     FROM pg_catalog.pg_class c
     INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname IN ('Tenant', 'tenants')`,
  );
  const names = new Set(rows.map((row) => row.relname));
  cachedTableRef = names.has('Tenant') ? '"Tenant"' : '"tenants"';
  return cachedTableRef;
}

export function tenantControlTableName(tableRef: TenantTableRef): string {
  return tableRef === '"Tenant"' ? 'Tenant' : 'tenants';
}

export async function tenantControlFromSql(
  db: TenantDbExecutor,
): Promise<string> {
  const tableRef = await resolveTenantControlTableRef(db);
  return `"public".${tableRef}`;
}

export async function loadTenantControlColumns(
  db: TenantDbExecutor,
): Promise<Set<string>> {
  if (cachedColumns) return cachedColumns;

  const tableRef = await resolveTenantControlTableRef(db);
  const tableName = tenantControlTableName(tableRef);
  const rows = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    tableName,
  );
  cachedColumns = new Set(rows.map((row) => row.column_name));
  return cachedColumns;
}

export async function buildTenantControlSelect(
  db: TenantDbExecutor,
): Promise<string> {
  if (cachedSelect) return cachedSelect;

  const columns = await loadTenantControlColumns(db);
  const parts = [
    'id',
    'name',
    'schema_name AS "schemaName"',
    'status',
    ...OPTIONAL_COLUMNS.filter(({ column }) => columns.has(column)).map(
      ({ select }) => select,
    ),
  ];
  cachedSelect = parts.join(',\n  ');
  return cachedSelect;
}

export async function hasTenantControlColumn(
  db: TenantDbExecutor,
  column: string,
): Promise<boolean> {
  const columns = await loadTenantControlColumns(db);
  return columns.has(column);
}

/** Reset cached introspection (tests only). */
export function resetTenantControlSchemaCache(): void {
  cachedTableRef = null;
  cachedColumns = null;
  cachedSelect = null;
}

