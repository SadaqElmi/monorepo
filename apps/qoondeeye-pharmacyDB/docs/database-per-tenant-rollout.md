# Database-Per-Tenant Rollout

Target architecture:

- Control database: SaaS metadata only.
- Tenant databases: ERP/POS data only, normal tables in `public`.
- `TENANCY_MODE=schema`: legacy schema-per-tenant tenants (default).
- `TENANCY_MODE=database`: strict mode; every active tenant must use a dedicated DB.
- Hybrid rollout: keep `TENANCY_MODE=schema` and migrate tenants one-by-one. Any tenant row with `database_url_encrypted` automatically routes through `TenantPrismaService`.

Required environment:

- `CONTROL_DATABASE_URL` or `DATABASE_URL`: control database.
- `TENANT_DATABASE_URL_ENCRYPTION_KEY`: 32-byte base64 or 64-char hex key.
- `TENANT_DB_ADMIN_URL`: PostgreSQL admin URL used only for provisioning/restore/migration.
- `PG_BIN_DIR`: optional path to PostgreSQL client tools (`pg_dump`, `pg_restore`) on Windows.
- `TENANT_PRISMA_MAX_CLIENTS=20`
- `TENANT_DB_POOL_MAX=3`

Commands:

- `pnpm prisma:migrate:control`
- `pnpm tenant:migrate:all` — migrate every active tenant with a dedicated database (recommended)
- `pnpm prisma:migrate:tenant -- --tenant=<slug>` — migrate one tenant by slug
- `pnpm prisma:migrate:tenant` — requires `TENANT_DATABASE_URL` in `.env`
- `pnpm tenant:migrate:schema-to-database -- --tenant=<slug> [--dry-run]`
- `pnpm tenant:guard:schema-sql [--strict]`
- `pnpm tenant:backup -- --tenant=<slug>`
- `pnpm tenant:restore:test -- --tenant=<slug> --target=<tenant_slug_restore_test_db>`
- `pnpm tenant:rollout:smoke -- --tenant=<slug>`
- `pnpm tenant:rollout:complete [--pilot=hayat] [--dry-run] [--skip-flip]`

Rollout rule:

1. Keep `TENANCY_MODE=schema`.
2. Deploy database-mode support.
3. Create one brand-new database-mode tenant with `POST /api/tenants` and `"storage": "database"`.
4. Test login, branches, products, inventory, sales/POS, purchases, accounting, imports, and audit logs.
5. Migrate one small old tenant: `pnpm tenant:migrate:schema-to-database -- --tenant=<slug>`.
6. Validate backup + restore: `pnpm tenant:backup` then `pnpm tenant:restore:test`.
7. Migrate remaining tenants one-by-one or with `pnpm tenant:migrate:all`.
8. Burn down `tenant:guard:schema-sql` findings, then flip `TENANCY_MODE=database` when every active tenant has `database_url_encrypted`.

Security rules:

- Never accept `databaseUrl`, `databaseName`, or `PrismaClient` from frontend/request input.
- All tenant DB access goes through `TenantPrismaService`.
- Encrypted database URLs stay only in control DB.
- Logs and API responses must not expose encrypted or decrypted database URLs.
- JWT `tenantId` and `tenantSchema` must match the resolved tenant.

Deletion policy:

1. Suspend tenant (`PATCH /api/tenants/:id` with `"status": "suspended"`).
2. Soft delete (`DELETE /api/tenants/:id`) — requires suspended status.
3. After backup/restore validation, physical purge via `pnpm tenant:purge:database -- --tenant=<slug> --confirm`.

Failed provisioning cleanup (never became active):

- Admin UI: **Abandon** on `provisioning` / `migration_failed` tenants.
- API: `POST /api/tenants/:id/abandon`
- CLI: `pnpm tenant:abandon -- --tenant=<slug>`

PgBouncer:

- Add later in front of tenant DB pools when connection counts require it.
