import 'dotenv/config';
import {
  createPgPool,
  resolveDatabaseUrl,
} from '../src/prisma/create-pg-adapter';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { argValue, hasFlag, runTenantPrismaMigrate } from './tenant-script-utils';

type TenantRow = {
  id: string;
  name: string;
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  database_url_encrypted: string;
};

async function runTenantMigration(databaseUrl: string): Promise<void> {
  await runTenantPrismaMigrate(databaseUrl);
}

async function main(): Promise<void> {
  const controlUrl = resolveDatabaseUrl();
  if (!controlUrl) {
    throw new Error(
      'Set CONTROL_DATABASE_URL or DATABASE_URL for the control database.',
    );
  }

  const migrationName = argValue('migration') ?? 'tenant:migrate:all';
  const tenantFilter = argValue('tenant');
  const dryRun = hasFlag('dry-run');
  const continueOnError = hasFlag('continue-on-error');
  const pool = createPgPool(controlUrl, { max: 3 });

  try {
    const { rows } = await pool.query<TenantRow>(
      `
      SELECT id, name, schema_name, slug, database_name, database_url_encrypted
      FROM "public"."Tenant"
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND database_url_encrypted IS NOT NULL
        AND (
          $1::text IS NULL
          OR schema_name = $1
          OR slug = $1
          OR database_name = $1
        )
      ORDER BY created_at ASC
      `,
      [tenantFilter ?? null],
    );

    console.log(
      `Tenant migration scan: ${rows.length} tenant(s), migration=${migrationName}, dryRun=${dryRun}`,
    );

    for (const tenant of rows) {
      const label = tenant.slug ?? tenant.schema_name;
      if (dryRun) {
        console.log(`[dry-run] would migrate ${label} (${tenant.database_name})`);
        continue;
      }

      const started = await pool.query<{ id: string }>(
        `
        INSERT INTO "public"."tenant_migration_runs"
          (tenant_id, migration_name, status, started_at)
        VALUES ($1::uuid, $2, 'running', CURRENT_TIMESTAMP)
        RETURNING id
        `,
        [tenant.id, migrationName],
      );
      const runId = started.rows[0]?.id;

      try {
        const databaseUrl = decryptTenantDatabaseUrl(
          tenant.database_url_encrypted,
        );
        await runTenantMigration(databaseUrl);
        await pool.query(
          `
          UPDATE "public"."tenant_migration_runs"
          SET status = 'success',
              finished_at = CURRENT_TIMESTAMP,
              error_message = NULL
          WHERE id = $1::uuid
          `,
          [runId],
        );
        console.log(`Migrated ${label} (${tenant.database_name})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await pool.query(
          `
          UPDATE "public"."tenant_migration_runs"
          SET status = 'failed',
              finished_at = CURRENT_TIMESTAMP,
              error_message = $2
          WHERE id = $1::uuid
          `,
          [runId, message],
        );
        console.error(`Migration failed for ${label}: ${message}`);
        if (!continueOnError) {
          throw err;
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
