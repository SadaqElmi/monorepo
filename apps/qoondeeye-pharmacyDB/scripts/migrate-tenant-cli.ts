import 'dotenv/config';
import { createPgPool } from '../src/prisma/create-pg-adapter';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import {
  argValue,
  requireControlUrl,
  runTenantPrismaMigrate,
} from './tenant-script-utils';

type TenantRow = {
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  database_url_encrypted: string;
};

function printUsage(): void {
  console.error(`
Tenant database URL is not configured for a direct Prisma deploy.

Use one of these:

  1. Migrate ALL active tenants (recommended):
     pnpm tenant:migrate:all

  2. Migrate ONE tenant by slug:
     pnpm prisma:migrate:tenant -- --tenant=hayat

  3. Migrate using an explicit connection string:
     $env:TENANT_DATABASE_URL="postgresql://user:pass@localhost:5432/tenant_hayat_db"
     pnpm prisma:migrate:tenant
`);
}

async function resolveTenantDatabaseUrl(): Promise<string | null> {
  const explicit = process.env.TENANT_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const tenantSlug = argValue('tenant');
  if (!tenantSlug) return null;

  const controlUrl = requireControlUrl();
  const pool = createPgPool(controlUrl, { max: 2 });
  try {
    const { rows } = await pool.query<TenantRow>(
      `
      SELECT schema_name, slug, database_name, database_url_encrypted
      FROM "public"."Tenant"
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND database_url_encrypted IS NOT NULL
        AND (
          lower(schema_name) = lower($1)
          OR lower(slug) = lower($1)
          OR lower(database_name) = lower($1)
        )
      LIMIT 1
      `,
      [tenantSlug],
    );
    const row = rows[0];
    if (!row) {
      throw new Error(
        `Active tenant "${tenantSlug}" not found or has no dedicated database URL.`,
      );
    }
    return decryptTenantDatabaseUrl(row.database_url_encrypted);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = await resolveTenantDatabaseUrl();
  if (!databaseUrl) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await runTenantPrismaMigrate(databaseUrl);
  console.log('Tenant migration applied successfully.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
