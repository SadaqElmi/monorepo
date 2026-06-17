import 'dotenv/config';
import pg from 'pg';
import { resolveDatabaseUrl } from '../src/prisma/create-pg-adapter';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { seedTenantErpDefaults } from '../src/tenant/tenant-erp-defaults.seed';
import { argValue } from './tenant-script-utils';

async function main(): Promise<void> {
  const tenantFilter = argValue('tenant');
  const controlUrl = resolveDatabaseUrl();
  if (!controlUrl) throw new Error('DATABASE_URL required');

  const control = new pg.Pool({ connectionString: controlUrl, max: 3 });
  try {
    const { rows } = await control.query<{
      schema_name: string;
      slug: string | null;
      database_url_encrypted: string;
    }>(
      `
      SELECT schema_name, slug, database_url_encrypted
      FROM "public"."Tenant"
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND database_url_encrypted IS NOT NULL
        AND (
          $1::text IS NULL
          OR schema_name = $1
          OR slug = $1
        )
      ORDER BY created_at ASC
      `,
      [tenantFilter ?? null],
    );

    for (const row of rows) {
      const label = row.slug ?? row.schema_name;
      const databaseUrl = decryptTenantDatabaseUrl(row.database_url_encrypted);
      await seedTenantErpDefaults(databaseUrl);
      console.log(`Seeded ERP defaults for ${label}`);
    }
  } finally {
    await control.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
