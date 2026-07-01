import 'dotenv/config';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { createPgPool } from '../src/prisma/create-pg-adapter';
import {
  argValue,
  escapeIdentifier,
  hasFlag,
  requireControlUrl,
  shouldDropTenantRole,
} from './tenant-script-utils';

type TenantRow = {
  id: string;
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  database_url_encrypted: string | null;
  status: string;
  deleted_at: string | null;
};

async function main(): Promise<void> {
  const tenantArg = argValue('tenant');
  if (!tenantArg) {
    throw new Error(
      'Usage: pnpm tenant:purge:database -- --tenant=<slug-or-schema> [--confirm]',
    );
  }
  if (!hasFlag('confirm')) {
    throw new Error(
      'Physical purge requires --confirm. Tenant DB/user are dropped permanently.',
    );
  }

  const controlUrl = requireControlUrl();
  const controlPool = createPgPool(controlUrl, { max: 1 });
  const adminUrl =
    process.env.TENANT_DB_ADMIN_URL?.trim();
  if (!adminUrl) {
    throw new Error(
      'TENANT_DB_ADMIN_URL is required for physical tenant purge',
    );
  }

  try {
    const { rows } = await controlPool.query<TenantRow>(
      `
      SELECT id, schema_name, slug, database_name, database_url_encrypted, status, deleted_at
      FROM "public"."Tenant"
      WHERE schema_name = $1 OR slug = $1 OR database_name = $1
      LIMIT 1
      `,
      [tenantArg],
    );
    const tenant = rows[0];
    if (!tenant) throw new Error(`Tenant not found: ${tenantArg}`);
    if (!tenant.database_url_encrypted) {
      throw new Error('Tenant has no dedicated database to purge');
    }
    if (tenant.status !== 'deleted' || !tenant.deleted_at) {
      throw new Error(
        'Tenant must be soft-deleted before physical database purge',
      );
    }

    const databaseName = tenant.database_name;
    decryptTenantDatabaseUrl(tenant.database_url_encrypted);
    const databaseUser = databaseName?.startsWith('tenant_')
      ? databaseName.replace(/_db$/, '_user')
      : null;

    const admin = createPgPool(adminUrl, { max: 1 });
    try {
      if (databaseName) {
        const db = escapeIdentifier(databaseName);
        await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
        console.log(`Dropped database ${databaseName}`);
      }
      if (databaseUser && shouldDropTenantRole()) {
        const user = escapeIdentifier(databaseUser);
        await admin.query(`DROP ROLE IF EXISTS "${user}"`);
        console.log(`Dropped role ${databaseUser}`);
      }
    } finally {
      await admin.end();
    }

    await controlPool.query(
      `
      UPDATE "public"."Tenant"
      SET database_name = NULL,
          database_url_encrypted = NULL,
          provisioning_status = NULL,
          provisioning_lock_id = NULL,
          provisioning_started_at = NULL,
          error_message = 'physical_database_purged'
      WHERE id = $1::uuid
      `,
      [tenant.id],
    );
    console.log(`Physical purge complete for tenant ${tenant.schema_name}`);
  } finally {
    await controlPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
