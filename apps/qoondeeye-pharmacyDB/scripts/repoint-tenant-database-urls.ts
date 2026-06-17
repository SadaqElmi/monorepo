import { encryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import {
  databaseUrlFor,
  hasFlag,
  requireControlUrl,
} from './tenant-script-utils';
import { createPgPool } from '../src/prisma/create-pg-adapter';

type TenantRow = {
  id: string;
  slug: string | null;
  schema_name: string;
  database_name: string | null;
};

async function main(): Promise<void> {
  const controlUrl = requireControlUrl();
  const adminUrl = process.env.TENANT_DB_ADMIN_URL?.trim();
  if (!adminUrl) {
    throw new Error('TENANT_DB_ADMIN_URL is required to repoint tenant databases.');
  }

  const dryRun = hasFlag('dry-run');
  const pool = createPgPool(controlUrl, { max: 3 });

  try {
    const { rows } = await pool.query<TenantRow>(
      `
      SELECT id, slug, schema_name, database_name
      FROM "public"."Tenant"
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND database_name IS NOT NULL
      ORDER BY created_at ASC
      `,
    );

    console.log(
      `Repoint tenant databases: ${rows.length} tenant(s), dryRun=${dryRun}`,
    );

    for (const tenant of rows) {
      const databaseName = tenant.database_name?.trim();
      if (!databaseName) continue;

      const label = tenant.slug ?? tenant.schema_name;
      const databaseUrl = databaseUrlFor(adminUrl, databaseName);
      const databaseUrlEncrypted = encryptTenantDatabaseUrl(databaseUrl);

      if (dryRun) {
        console.log(`[dry-run] would repoint ${label} -> ${databaseName}`);
        continue;
      }

      await pool.query(
        `
        UPDATE "public"."Tenant"
        SET database_url_encrypted = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
        `,
        [tenant.id, databaseUrlEncrypted],
      );
      console.log(`Repointed ${label} -> ${databaseName}`);
    }
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
