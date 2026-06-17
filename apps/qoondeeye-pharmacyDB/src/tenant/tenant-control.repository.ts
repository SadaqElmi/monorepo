import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  buildTenantControlSelect,
  hasTenantControlColumn,
  loadTenantControlColumns,
  tenantControlFromSql,
} from './tenant-control.schema';
import type { ControlTenantRecord } from './tenant.types';

/** DB executor (PrismaService or transaction client). */
export type TenantDbExecutor =
  | PrismaService
  | Prisma.TransactionClient;

async function tenantSelect(db: TenantDbExecutor): Promise<string> {
  return buildTenantControlSelect(db);
}

async function tenantFrom(db: TenantDbExecutor): Promise<string> {
  return tenantControlFromSql(db);
}

export type CreateProvisioningTenantInput = {
  name: string;
  schemaName: string;
  slug: string;
  subdomain: string;
  customDomain?: string | null;
  databaseName: string;
  status: string;
  provisioningStatus: string;
  provisioningLockId: string;
  provisioningStartedAt: Date;
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export type UpdateTenantControlInput = {
  name?: string;
  status?: string;
  provisioningStatus?: string | null;
  provisioningLockId?: string | null;
  databaseUrlEncrypted?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  lastLoginAt?: Date | null;
  databaseHealthStatus?: string | null;
  migrationStatus?: string | null;
  storageUsedBytes?: bigint | number | null;
  lastBackupAt?: Date | null;
  errorMessage?: string | null;
  deletedAt?: Date | null;
  scheduledDeleteAt?: Date | null;
};

export async function findTenantConflict(
  db: TenantDbExecutor,
  input: {
    schemaName: string;
    slug: string;
    subdomain: string;
    databaseName: string;
  },
): Promise<ControlTenantRecord | null> {
  const columns = await loadTenantControlColumns(db);
  const select = await tenantSelect(db);
  const conditions = ['schema_name = $1'];
  const params: unknown[] = [input.schemaName];
  let index = 2;

  if (columns.has('slug')) {
    conditions.push(`slug = $${index++}`);
    params.push(input.slug);
  }
  if (columns.has('subdomain')) {
    conditions.push(`subdomain = $${index++}`);
    params.push(input.subdomain);
  }
  if (columns.has('database_name')) {
    conditions.push(`database_name = $${index++}`);
    params.push(input.databaseName);
  }

  const fromSql = await tenantFrom(db);
  const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
    `SELECT ${select}
     FROM ${fromSql}
     WHERE ${conditions.join(' OR ')}
     LIMIT 1`,
    ...params,
  );
  return rows[0] ?? null;
}

export async function createProvisioningTenant(
  db: TenantDbExecutor,
  input: CreateProvisioningTenantInput,
): Promise<ControlTenantRecord> {
  const select = await tenantSelect(db);
  const fromSql = await tenantFrom(db);
  const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
    `INSERT INTO ${fromSql} (
       name,
       schema_name,
       slug,
       subdomain,
       custom_domain,
       database_name,
       status,
       provisioning_status,
       provisioning_lock_id,
       provisioning_started_at,
       owner_user_id,
       owner_name,
       owner_email
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11::uuid, $12, $13
     )
     RETURNING ${select}`,
    input.name,
    input.schemaName,
    input.slug,
    input.subdomain,
    input.customDomain ?? null,
    input.databaseName,
    input.status,
    input.provisioningStatus,
    input.provisioningLockId,
    input.provisioningStartedAt,
    input.ownerUserId ?? null,
    input.ownerName ?? null,
    input.ownerEmail ?? null,
  );
  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create provisioning tenant row');
  }
  return row;
}

export async function updateTenantControl(
  db: TenantDbExecutor,
  tenantId: string,
  input: UpdateTenantControlInput,
): Promise<ControlTenantRecord> {
  const select = await tenantSelect(db);
  const columns = await loadTenantControlColumns(db);
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const add = (column: string, value: unknown) => {
    sets.push(`${column} = $${index}`);
    values.push(value);
    index++;
  };

  if (input.name !== undefined) add('name', input.name);
  if (input.status !== undefined) add('status', input.status);
  if (input.provisioningStatus !== undefined && columns.has('provisioning_status')) {
    add('provisioning_status', input.provisioningStatus);
  }
  if (input.provisioningLockId !== undefined && columns.has('provisioning_lock_id')) {
    add('provisioning_lock_id', input.provisioningLockId);
  }
  if (input.databaseUrlEncrypted !== undefined && columns.has('database_url_encrypted')) {
    add('database_url_encrypted', input.databaseUrlEncrypted);
  }
  if (input.ownerUserId !== undefined && columns.has('owner_user_id')) {
    add('owner_user_id', input.ownerUserId);
  }
  if (input.ownerName !== undefined && columns.has('owner_name')) {
    add('owner_name', input.ownerName);
  }
  if (input.ownerEmail !== undefined && columns.has('owner_email')) {
    add('owner_email', input.ownerEmail);
  }
  if (input.lastLoginAt !== undefined && columns.has('last_login_at')) {
    add('last_login_at', input.lastLoginAt);
  }
  if (
    input.databaseHealthStatus !== undefined &&
    columns.has('database_health_status')
  ) {
    add('database_health_status', input.databaseHealthStatus);
  }
  if (input.migrationStatus !== undefined && columns.has('migration_status')) {
    add('migration_status', input.migrationStatus);
  }
  if (
    input.storageUsedBytes !== undefined &&
    columns.has('storage_used_bytes')
  ) {
    add('storage_used_bytes', input.storageUsedBytes);
  }
  if (input.lastBackupAt !== undefined && columns.has('last_backup_at')) {
    add('last_backup_at', input.lastBackupAt);
  }
  if (input.errorMessage !== undefined && columns.has('error_message')) {
    add('error_message', input.errorMessage);
  }
  if (input.deletedAt !== undefined && columns.has('deleted_at')) {
    add('deleted_at', input.deletedAt);
  }
  if (input.scheduledDeleteAt !== undefined && columns.has('scheduled_delete_at')) {
    add('scheduled_delete_at', input.scheduledDeleteAt);
  }

  if (!sets.length) {
    const fromSql = await tenantFrom(db);
    const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
      `SELECT ${select} FROM ${fromSql} WHERE id = $1::uuid LIMIT 1`,
      tenantId,
    );
    const row = rows[0];
    if (!row) throw new Error(`Tenant not found: ${tenantId}`);
    return row;
  }

  if (columns.has('updated_at')) {
    sets.push('updated_at = CURRENT_TIMESTAMP');
  }
  values.push(tenantId);

  const fromSql = await tenantFrom(db);
  const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
    `UPDATE ${fromSql}
     SET ${sets.join(', ')}
     WHERE id = $${index}::uuid
     RETURNING ${select}`,
    ...values,
  );
  const row = rows[0];
  if (!row) throw new Error(`Tenant not found: ${tenantId}`);
  return row;
}

export async function findTenantByAlias(
  db: TenantDbExecutor,
  alias: string,
  options?: { activeOnly?: boolean },
): Promise<ControlTenantRecord | null> {
  const normalized = alias.trim().toLowerCase();
  if (!normalized) return null;

  const columns = await loadTenantControlColumns(db);
  const select = await tenantSelect(db);
  const matchParts = ['lower(schema_name) = $1'];
  if (columns.has('subdomain')) {
    matchParts.unshift('lower(subdomain) = $1');
  }
  if (columns.has('slug')) {
    matchParts.unshift("lower(COALESCE(slug, '')) = $1");
  }

  const activeDbClause =
    options?.activeOnly && columns.has('database_url_encrypted')
      ? `AND database_url_encrypted IS NOT NULL AND btrim(database_url_encrypted) <> ''`
      : '';
  const statusClause = options?.activeOnly
    ? `AND status = 'active' ${activeDbClause}`
    : '';
  const fromSql = await tenantFrom(db);
  const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
    `SELECT ${select}
     FROM ${fromSql}
     WHERE (${matchParts.join(' OR ')})
     ${statusClause}
     LIMIT 1`,
    normalized,
  );
  return rows[0] ?? null;
}

export async function findTenantBySchemaName(
  db: TenantDbExecutor,
  schemaName: string,
  options?: { activeOnly?: boolean; caseInsensitive?: boolean },
): Promise<ControlTenantRecord | null> {
  const trimmed = schemaName.trim();
  if (!trimmed) return null;

  const select = await tenantSelect(db);
  const columns = await loadTenantControlColumns(db);
  const activeDbClause =
    options?.activeOnly && columns.has('database_url_encrypted')
      ? `AND database_url_encrypted IS NOT NULL AND btrim(database_url_encrypted) <> ''`
      : '';
  const statusClause = options?.activeOnly
    ? `AND status = 'active' ${activeDbClause}`
    : '';
  const schemaClause = options?.caseInsensitive
    ? 'lower(schema_name) = lower($1)'
    : 'schema_name = $1';

  const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
    `SELECT ${select}
     FROM ${await tenantFrom(db)}
     WHERE ${schemaClause}
     ${statusClause}
     LIMIT 1`,
    trimmed,
  );
  return rows[0] ?? null;
}

export async function getTenantControlById(
  db: TenantDbExecutor,
  tenantId: string,
): Promise<ControlTenantRecord | null> {
  const select = await tenantSelect(db);
  const fromSql = await tenantFrom(db);
  const rows = await db.$queryRawUnsafe<ControlTenantRecord[]>(
    `SELECT ${select} FROM ${fromSql} WHERE id = $1::uuid LIMIT 1`,
    tenantId,
  );
  return rows[0] ?? null;
}

export async function ensureDatabasePerTenantMigrationApplied(
  db: TenantDbExecutor,
): Promise<boolean> {
  return hasTenantControlColumn(db, 'database_url_encrypted');
}

export async function listAllTenants(
  db: TenantDbExecutor,
): Promise<ControlTenantRecord[]> {
  const select = await tenantSelect(db);
  const columns = await loadTenantControlColumns(db);
  const orderBy = columns.has('created_at')
    ? 'created_at DESC'
    : 'schema_name ASC';

  const fromSql = await tenantFrom(db);
  return db.$queryRawUnsafe<ControlTenantRecord[]>(
    `SELECT ${select}
     FROM ${fromSql}
     ORDER BY ${orderBy}`,
  );
}

export async function listTenantsByIds(
  db: TenantDbExecutor,
  tenantIds: readonly string[],
): Promise<ControlTenantRecord[]> {
  if (!tenantIds.length) return [];
  const select = await tenantSelect(db);
  const fromSql = await tenantFrom(db);
  return db.$queryRawUnsafe<ControlTenantRecord[]>(
    `SELECT ${select}
     FROM ${fromSql}
     WHERE id = ANY($1::uuid[])`,
    tenantIds,
  );
}

export async function listActiveTenantSchemas(
  db: TenantDbExecutor,
): Promise<Array<{ id: string; schemaName: string }>> {
  const tenants = await listActiveDedicatedTenants(db);
  return tenants.map(({ id, schemaName }) => ({ id, schemaName }));
}

/** Active tenants with a provisioned dedicated database (skips legacy/incomplete rows). */
export async function listActiveDedicatedTenants(
  db: TenantDbExecutor,
): Promise<Array<{ id: string; schemaName: string; name: string }>> {
  const fromSql = await tenantFrom(db);
  const columns = await loadTenantControlColumns(db);
  const dbFilter = columns.has('database_url_encrypted')
    ? ` AND database_url_encrypted IS NOT NULL AND btrim(database_url_encrypted) <> ''`
    : '';
  return db.$queryRawUnsafe<Array<{ id: string; schemaName: string; name: string }>>(
    `SELECT id, schema_name AS "schemaName", name
     FROM ${fromSql}
     WHERE status = 'active'${dbFilter}
     ORDER BY schema_name ASC`,
  );
}

export async function getTenantIdBySchemaName(
  db: TenantDbExecutor,
  schemaName: string,
): Promise<string | null> {
  const fromSql = await tenantFrom(db);
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id
     FROM ${fromSql}
     WHERE schema_name = $1
     LIMIT 1`,
    schemaName,
  );
  return rows[0]?.id ?? null;
}
