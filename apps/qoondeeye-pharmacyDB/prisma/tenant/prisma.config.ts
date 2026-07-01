// Env is loaded via `node -r ./load-env.cjs` in package.json scripts (before this file runs).
import { defineConfig } from 'prisma/config';

/**
 * Used by `prisma generate` and `prisma migrate deploy --config prisma/tenant/prisma.config.ts`.
 * `prisma generate` does not connect to the DB; a placeholder URL is used when env vars are unset
 * (e.g. CI/Vercel install). Migrate scripts must set TENANT_DATABASE_URL before deploy:
 * `pnpm prisma:migrate:tenant`, `pnpm tenant:migrate:all`, or runTenantPrismaMigrate().
 */
const TENANT_GENERATE_PLACEHOLDER_URL =
  'postgresql://prisma-generate-only@127.0.0.1:5432/prisma_generate_only';

function resolveTenantMigrateUrl(): string {
  return (
    process.env.TENANT_DATABASE_URL?.trim() ||
    process.env.TENANT_DB_ADMIN_URL?.trim() ||
    TENANT_GENERATE_PLACEHOLDER_URL
  );
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
