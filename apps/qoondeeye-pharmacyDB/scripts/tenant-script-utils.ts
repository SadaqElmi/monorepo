import { exec } from 'child_process';
import { promisify } from 'util';
import { createPgPool, resolveDatabaseUrl } from '../src/prisma/create-pg-adapter';
import { runTenantPrismaMigrate as runTenantPrismaMigrateImpl } from '../src/tenant/run-tenant-prisma-migrate';
import { usesSharedDatabaseOwner } from '../src/tenant/tenant-database-provision-mode';

const execAsync = promisify(exec);

export async function runShellCommand(
  command: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  await execAsync(command, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024 * 20,
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  });
}

export async function runTenantPrismaMigrate(databaseUrl: string): Promise<void> {
  await runTenantPrismaMigrateImpl(databaseUrl);
}

export function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function requireControlUrl(): string {
  const controlUrl = resolveDatabaseUrl();
  if (!controlUrl) {
    throw new Error(
      'Set CONTROL_DATABASE_URL or DATABASE_URL for the control database.',
    );
  }
  return controlUrl;
}

export function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

export function assertSafeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error(
      'Tenant slug must contain only lowercase letters, numbers, and underscores',
    );
  }
  return normalized;
}

export function databaseNameForSlug(slug: string): string {
  return `tenant_${assertSafeSlug(slug)}_db`;
}

export function databaseUserForSlug(slug: string): string {
  return `tenant_${assertSafeSlug(slug)}_user`;
}

export function shouldDropTenantRole(): boolean {
  return !usesSharedDatabaseOwner();
}

export function escapeIdentifier(value: string): string {
  return value.replace(/"/g, '""');
}

export async function listTenantTables(
  pool: ReturnType<typeof createPgPool>,
  schemaName: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
    `,
    [schemaName],
  );
  return rows.map((row) => row.table_name);
}

export async function countRows(
  pool: ReturnType<typeof createPgPool>,
  schemaName: string,
  tableName: string,
): Promise<number> {
  const schema = escapeIdentifier(schemaName);
  const table = escapeIdentifier(tableName);
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "${schema}"."${table}"`,
  );
  return Number.parseInt(rows[0]?.count ?? '0', 10);
}
