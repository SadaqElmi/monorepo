import 'dotenv/config';
import pg from 'pg';
import { resolveDatabaseUrl } from '../src/prisma/create-pg-adapter';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { runTenantPrismaMigrate } from './tenant-script-utils';

async function main(): Promise<void> {
  const tenantSlug = process.argv[2] ?? 'hayat';
  const migration = process.argv[3] ?? '20260610100000_erp_extensions';
  const controlUrl = resolveDatabaseUrl();
  if (!controlUrl) throw new Error('DATABASE_URL required');

  const control = new pg.Pool({ connectionString: controlUrl, max: 2 });
  try {
    const { rows } = await control.query<{ database_url_encrypted: string }>(
      `SELECT database_url_encrypted
       FROM "public"."Tenant"
       WHERE slug = $1 OR schema_name = $1
       LIMIT 1`,
      [tenantSlug],
    );
    const row = rows[0];
    if (!row?.database_url_encrypted) {
      throw new Error(`Tenant ${tenantSlug} not found`);
    }
    const tenantUrl = decryptTenantDatabaseUrl(row.database_url_encrypted);
    const tenant = new pg.Pool({ connectionString: tenantUrl, max: 2 });
    try {
      const del = await tenant.query(
        `DELETE FROM "_prisma_migrations"
         WHERE migration_name = $1 AND finished_at IS NULL`,
        [migration],
      );
      console.log(`Cleared ${del.rowCount ?? 0} failed migration row(s) for ${tenantSlug}`);
    } finally {
      await tenant.end();
    }

    await runTenantPrismaMigrate(tenantUrl);
    console.log(`Migration deploy succeeded for ${tenantSlug}`);
  } finally {
    await control.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
