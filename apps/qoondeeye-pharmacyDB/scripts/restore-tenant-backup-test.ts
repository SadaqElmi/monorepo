import 'dotenv/config';
import { execFile } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { Pool } from 'pg';
import {
  createPgPool,
  resolveDatabaseUrl,
} from '../src/prisma/create-pg-adapter';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { resolvePgTool } from './pg-bin';
import { argValue, hasFlag } from './tenant-script-utils';

const execFileAsync = promisify(execFile);

type TenantRestoreRow = {
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  database_url_encrypted: string;
};

function safeDbName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error('Target database name must use only a-z, 0-9, underscore');
  }
  return normalized;
}

function databaseUrlFor(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

async function databaseExists(adminPool: Pool, databaseName: string) {
  const { rowCount } = await adminPool.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [databaseName],
  );
  return Boolean(rowCount);
}

async function verifyRestore(targetUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: targetUrl, max: 1 });
  const tables = ['users', 'branches', 'products', 'sales', 'purchases'];
  try {
    for (const table of tables) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "public"."${table}"`,
      );
      console.log(`restore check ${table}: ${rows[0]?.count ?? '0'}`);
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const tenant = argValue('tenant');
  if (!tenant) {
    throw new Error(
      'Usage: pnpm tenant:restore:test -- --tenant=<slug-or-schema> [--target=<db>] [--force]',
    );
  }

  const controlUrl = resolveDatabaseUrl();
  if (!controlUrl) {
    throw new Error(
      'Set CONTROL_DATABASE_URL or DATABASE_URL for the control database.',
    );
  }

  const controlPool = createPgPool(controlUrl, { max: 1 });
  let tempDir: string | null = null;
  try {
    const { rows } = await controlPool.query<TenantRestoreRow>(
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

    const sourceUrl = decryptTenantDatabaseUrl(row.database_url_encrypted);
    const adminUrl =
    process.env.TENANT_DB_ADMIN_URL?.trim() ||
    databaseUrlFor(sourceUrl, 'postgres');
  if (!adminUrl) {
    throw new Error(
      'TENANT_DB_ADMIN_URL is required to restore tenant backup test',
    );
    }
    const targetDatabase = safeDbName(
      argValue('target') ??
        `${row.database_name ?? `tenant_${row.slug ?? row.schema_name}_db`}_restore_test`,
    );

    const adminPool = new Pool({ connectionString: adminUrl, max: 1 });
    try {
      if (await databaseExists(adminPool, targetDatabase)) {
        if (!hasFlag('force')) {
          throw new Error(
            `Restore target already exists: ${targetDatabase}. Use --force to replace it.`,
          );
        }
        await adminPool.query(`DROP DATABASE "${targetDatabase}" WITH (FORCE)`);
      }
      await adminPool.query(`CREATE DATABASE "${targetDatabase}"`);
    } finally {
      await adminPool.end();
    }

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'tenant-restore-test-'));
    const dumpFile = path.join(tempDir, 'tenant.dump');
    const pgDump = resolvePgTool('pg_dump');
    const pgRestore = resolvePgTool('pg_restore');
    await execFileAsync(
      pgDump,
      ['--format=custom', `--file=${dumpFile}`, sourceUrl],
      { maxBuffer: 1024 * 1024 * 10 },
    );

    const targetUrl = databaseUrlFor(adminUrl, targetDatabase);
    await execFileAsync(pgRestore, ['--dbname', targetUrl, dumpFile], {
      maxBuffer: 1024 * 1024 * 10,
    });

    await verifyRestore(targetUrl);
    console.log(`Restore test completed: ${targetDatabase}`);
  } finally {
    await controlPool.end();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
