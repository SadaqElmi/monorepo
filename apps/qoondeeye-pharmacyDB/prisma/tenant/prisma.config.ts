// Env is loaded via `node -r ./load-env.cjs` in package.json scripts (before this file runs).
import { defineConfig } from 'prisma/config';

/**
 * Used by `prisma migrate deploy --config prisma/tenant/prisma.config.ts`.
 * `pnpm prisma:migrate:tenant` sets TENANT_DATABASE_URL via scripts/migrate-tenant-cli.ts
 * or scripts/migrate-all-tenants.ts before invoking Prisma.
 */
function resolveTenantMigrateUrl(): string {
  const url =
    process.env.TENANT_DATABASE_URL?.trim() ||
    process.env.TENANT_DB_ADMIN_URL?.trim() ||
    '';

  if (!url) {
    throw new Error(
      [
        'TENANT_DATABASE_URL is required for tenant Prisma migrate.',
        'Run: pnpm tenant:migrate:all',
        'Or: pnpm prisma:migrate:tenant -- --tenant=<slug>',
        'Or set TENANT_DATABASE_URL to a tenant database connection string.',
      ].join(' '),
    );
  }

  return url;
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: resolveTenantMigrateUrl(),
  },
});
