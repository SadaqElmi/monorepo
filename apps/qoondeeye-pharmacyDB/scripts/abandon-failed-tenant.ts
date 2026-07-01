import 'dotenv/config';
import {
  createPgPool,
} from '../src/prisma/create-pg-adapter';
import {
  argValue,
  databaseNameForSlug,
  databaseUserForSlug,
  escapeIdentifier,
  requireControlUrl,
  shouldDropTenantRole,
} from './tenant-script-utils';

type TenantRow = {
  id: string;
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  status: string;
};

async function dropDedicatedDatabase(
  databaseName: string,
  slug: string,
): Promise<void> {
  const adminUrl =
    process.env.TENANT_DB_ADMIN_URL?.trim();
  if (!adminUrl) {
    throw new Error(
      'TENANT_DB_ADMIN_URL is required to drop tenant databases',
    );
  }

  const databaseUser = databaseUserForSlug(slug);
  const admin = createPgPool(adminUrl, { max: 1 });
  try {
    const db = escapeIdentifier(databaseName);
    await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    console.log(`Dropped database ${databaseName}`);
    if (shouldDropTenantRole()) {
      const user = escapeIdentifier(databaseUser);
      await admin.query(`DROP ROLE IF EXISTS "${user}"`);
      console.log(`Dropped role ${databaseUser}`);
    }
  } finally {
    await admin.end();
  }
}

async function main(): Promise<void> {
  const tenantArg = argValue('tenant');
  if (!tenantArg) {
    throw new Error('Usage: pnpm tenant:abandon -- --tenant=<slug-or-schema>');
  }

  const normalized = tenantArg.trim().toLowerCase();
  const controlUrl = requireControlUrl();
  const controlPool = createPgPool(controlUrl, { max: 1 });

  try {
    const { rows } = await controlPool.query<TenantRow>(
      `
      SELECT id, schema_name, slug, database_name, status
      FROM "public"."Tenant"
      WHERE schema_name = $1 OR slug = $1 OR database_name = $1
      LIMIT 1
      `,
      [normalized],
    );
    const tenant = rows[0];
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantArg}`);
    }
    if (
      tenant.status !== 'provisioning' &&
      tenant.status !== 'migration_failed' &&
      tenant.status !== 'provisioning_failed'
    ) {
      throw new Error(
        `Tenant status is "${tenant.status}". Only provisioning, provisioning_failed, or migration_failed tenants can be abandoned.`,
      );
    }

    const slug = tenant.slug ?? tenant.schema_name;
    const databaseName =
      tenant.database_name?.trim() || databaseNameForSlug(slug);

    try {
      await dropDedicatedDatabase(databaseName, slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Database teardown warning: ${message}`);
    }

    await controlPool.query(
      `DELETE FROM "public"."Domain" WHERE tenant_id = $1::uuid`,
      [tenant.id],
    );
    await controlPool.query(
      `DELETE FROM "public"."pos_devices" WHERE tenant_id = $1::uuid`,
      [tenant.id],
    );
    await controlPool.query(
      `DELETE FROM "public"."reconciliation_logs" WHERE tenant_id = $1::uuid`,
      [tenant.id],
    );
    await controlPool.query(
      `DELETE FROM "public"."reconciliation_runs" WHERE tenant_id = $1::uuid`,
      [tenant.id],
    );
    await controlPool.query(
      `DELETE FROM "public"."Tenant" WHERE id = $1::uuid`,
      [tenant.id],
    );

    console.log(`Abandoned tenant ${tenant.schema_name} (${tenant.id})`);
  } finally {
    await controlPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
