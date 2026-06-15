import 'dotenv/config';
import { execFile } from 'child_process';
import { mkdir } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import {
  createPgPool,
  resolveDatabaseUrl,
} from '../src/prisma/create-pg-adapter';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { resolvePgTool } from './pg-bin';
import { argValue } from './tenant-script-utils';

const execFileAsync = promisify(execFile);

type TenantBackupRow = {
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  database_url_encrypted: string;
};

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const tenant = argValue('tenant');
  if (!tenant) {
    throw new Error('Usage: pnpm tenant:backup -- --tenant=<slug-or-schema>');
  }

  const controlUrl = resolveDatabaseUrl();
  if (!controlUrl) {
    throw new Error(
      'Set CONTROL_DATABASE_URL or DATABASE_URL for the control database.',
    );
  }

  const pool = createPgPool(controlUrl, { max: 1 });
  try {
    const { rows } = await pool.query<TenantBackupRow>(
      `
      SELECT schema_name, slug, database_name, database_url_encrypted
      FROM "public"."Tenant"
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND database_url_encrypted IS NOT NULL
        AND (schema_name = $1 OR slug = $1 OR database_name = $1)
      LIMIT 1
      `,
      [tenant],
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`Active database-mode tenant not found: ${tenant}`);
    }

    const databaseUrl = decryptTenantDatabaseUrl(row.database_url_encrypted);
    const outDir = path.resolve(process.cwd(), 'dumps');
    await mkdir(outDir, { recursive: true });
    const file = path.join(
      outDir,
      `${row.database_name ?? row.slug ?? row.schema_name}-${timestamp()}.dump`,
    );

    const pgDump = resolvePgTool('pg_dump');
    try {
      await execFileAsync(pgDump, ['--format=custom', `--file=${file}`, databaseUrl], {
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error(
          `pg_dump not found. Install PostgreSQL client tools or set PG_BIN_DIR in .env (e.g. C:\\Program Files\\PostgreSQL\\16\\bin)`,
        );
      }
      throw err;
    }
    console.log(`Tenant backup created: ${file}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
