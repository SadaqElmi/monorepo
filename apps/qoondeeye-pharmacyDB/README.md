# PharmaCare Backend

c
NestJS backend for the PharmaCare multi-tenant Pharmacy SaaS.

## Architecture

- **Database**: PostgreSQL
- **ORM**: Prisma
- **Multi-tenancy**: Schema-per-tenant (e.g. `pharmacy1`, `pharmacy2`)

```
Database
├── public (SaaS core)
│   ├── tenants
│   ├── domains
│   └── system_users
├── tenant_template (Prisma migration template)
├── pharmacy1 (tenant schema)
├── pharmacy2 (tenant schema)
└── ...
```

## Setup

### 1. Install dependencies

From the **monorepo root** (not only this folder):

```bash
pnpm install
```

### 2. Configure database

Create a PostgreSQL database and set a connection URL in `.env`:

- **Production (e.g. Render):** `DATABASE_URL` is injected by the platform.
- **Local / shared dev:** use `DATABASE_URL_LOCAL` or `DATABASE_URL_STAGING` (see [`prisma.config.ts`](prisma.config.ts)).

```env
# Example local
DATABASE_URL_LOCAL="postgresql://USER:PASSWORD@localhost:5432/pharmacare?schema=public"

# Optional: Prisma CLI / migrate may honor URL hints (runtime pooling uses explicit `pg.Pool` in code)
# DATABASE_URL_LOCAL="postgresql://USER:PASSWORD@localhost:5432/pharmacare?schema=public&connection_limit=10&pool_timeout=20"
```

The API uses a single `pg` pool with **`max: 10`**, **`idleTimeoutMillis: 30000`**, **`connectionTimeoutMillis: 20000`** ([`src/prisma/create-pg-adapter.ts`](src/prisma/create-pg-adapter.ts)).

### Redis (optional cache)

The API uses **`@nestjs/cache-manager`** with **`cache-manager-redis-yet`** when `REDIS_URL` is set. If Redis is missing or fails to connect, the server **still starts** and uses an **in-memory** cache (per process only).

```env
# Upstash / Render / any TLS or plain Redis URL (same format as redis-cli -u)
REDIS_URL="rediss://default:TOKEN@HOST:6379"

# Default TTL for cached API payloads (milliseconds). Falls back to 60_000.
CACHE_DEFAULT_TTL_MS=60000
```

**Render:** add `REDIS_URL` (and optionally `CACHE_DEFAULT_TTL_MS`) in the service **Environment** tab. Do not commit secrets; use the dashboard or secret files.

**Upstash:** create a Redis database, copy the **Redis** connection string (TLS uses `rediss://`), and set it as `REDIS_URL`. REST URL/token (`UPSTASH_REDIS_REST_*`) are for HTTP clients only; this Nest stack uses the **TCP** URL for `cache-manager-redis-yet`.

**Local:** install Redis locally or use Upstash; omit `REDIS_URL` to run without Redis during development.

**What is cached:**

- **Catalog reads (30–60s TTL, `CACHE_CATALOG_TTL_MS`):** products list, tenant product catalog, categories, branches — keys like `tenant:{tenantId}:branch:{branchScope}:products:list`.
- **Roles list (`CACHE_ROLES_TTL_MS`, default 5m):** `tenant:{tenantId}:branch:all:roles:list`.
- **Dashboard / reports:** executive summary, fiscal report, dashboard series, top products, P&amp;L / balance sheet / cash flow (see [`financial-reports.service.ts`](src/accounting/financial-reports.service.ts)).
- Reconciliation: latest completed run, health snapshots (see [`reconciliation.service.ts`](src/reconciliation/reconciliation.service.ts)).
- Branch security metrics: branch access denied rollups (see [`branch-security-metrics.service.ts`](src/accounting/branch-security-metrics.service.ts)).

**Not cached:** login, `POST` sales/purchases/transfers/journals, POS session posting, `GET` inventory (live stock), `GET` products/transfer-catalog.

**Multi-tenant safety:** every cache key and invalidation **tag** includes public **tenantId** and branch scope. Report keys use `financial:{schema}:branch:{branchId}`; catalog tags use `tenant:{tenantId}:branch:{branchId}:catalog`.

**Invalidation:** targeted only — no `FLUSHDB`. Tag sets (`pharmcare:v1:cache-tag:*`) track which keys belong to `financial:*`, `reconciliation:*`, `branch-stats:*`, etc. Mutations (sales, purchases, transfers + reconciliation runs) call [`CacheInvalidationService`](src/cache/cache-invalidation.service.ts) to drop affected tags.

**Rate limiting:** uses the same Redis client when available ([`src/common/rate-limit/`](src/common/rate-limit/)); falls back to in-memory counters per process if Redis is offline (API still starts). Keys are tenant/user/IP-aware and never shared across tenants.

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_LOGIN_PER_MIN=5
RATE_LIMIT_PIN_PER_MIN=10
RATE_LIMIT_STAFF_LOGIN_PER_MIN=10
RATE_LIMIT_AUTH_OTHER_PER_MIN=10
RATE_LIMIT_PUBLIC_PER_MIN=30
RATE_LIMIT_REPORTS_PER_MIN=20
RATE_LIMIT_API_PER_MIN=200
LOGIN_RATE_LIMIT_TTL=60
LOGIN_RATE_LIMIT_MAX=5
```

Skipped: `GET /api` (health), `GET /api/inventory/stream` (SSE), `OPTIONS`. Tests set `RATE_LIMIT_ENABLED=false` by default ([`test/jest-setup.ts`](test/jest-setup.ts)).

**Structured HTTP logging:** [`src/common/logging/`](src/common/logging/) logs method, path, status, duration, `tenantId`, `branchId`, `userId`, `requestId` (JSON in production). Auth bodies are never logged; sensitive fields are redacted. Slow request warnings: API &gt; `LOG_SLOW_API_MS` (default 500), reports &gt; `LOG_SLOW_REPORT_MS` (default 2000). Prisma slow queries &gt; `PRISMA_SLOW_QUERY_MS` (default 400) log model/target and duration only (no SQL/params).

Device-bound POS rollout flags:

```env
# legacy | dual | device
POS_DEVICE_LOGIN_MODE=dual

# Optional comma-separated tenant schema names forced to use device login while global mode stays dual
POS_DEVICE_ENFORCED_TENANTS=pharmacy1,pharmacy2
```

### 3. Run migrations

```bash
pnpm run prisma:migrate
```

This creates the `public` and `tenant_template` schemas.

**Tenant DDL vs migrations:** Live tenant schemas (`pharmacy1`, …) are **not** created by rerunning Prisma migrations per tenant. New tenants get `provisionTenantSchema` plus idempotent **`TenantService.applyTenantSchemaPatches`**. Startup also runs patches for each active tenant (unless `TENANT_SCHEMA_SYNC_ON_BOOT=false`). When you change tenant data shapes, mirror them with new `ensure*` steps in [`applyTenantSchemaPatches`](src/tenant/tenant.service.ts)—do not rely on `prisma migrate deploy` alone for existing tenant schemas.

### 4. Generate Prisma client

```bash
pnpm run prisma:generate
```

### 5. Start the server

```bash
pnpm run start:dev
```

## API

### SaaS Admin (no tenant required)

| Method | Endpoint       | Description                      |
| ------ | -------------- | -------------------------------- |
| GET    | `/api/tenants` | List all tenants                 |
| POST   | `/api/tenants` | Create tenant + provision schema |

**Create tenant body:**

```json
{
  "name": "Pharmacy One",
  "schemaName": "pharmacy1",
  "domains": ["pharmacy1.yourapp.com"]
}
```

### Tenant flow

1. User visits `pharmacy1.yourapp.com`
2. Middleware resolves tenant from subdomain/domain
3. `TenantContextService` holds current tenant
4. `PrismaService.withTenantSchema()` sets `search_path` for queries

## Scripts

| Script                           | Description             |
| -------------------------------- | ----------------------- |
| `pnpm run start:dev`             | Start with hot reload   |
| `pnpm run build`                 | Build for production    |
| `pnpm run prisma:generate`       | Generate Prisma client  |
| `pnpm run prisma:migrate`        | Run migrations (dev)    |
| `pnpm run prisma:migrate:deploy` | Apply migrations (prod) |
| `pnpm run prisma:studio`         | Open Prisma Studio      |

## Tenant schema tables

Each pharmacy schema includes:

- `users`, `branches`, `product_categories`, `products`
- `suppliers`, `customers`, `purchases`, `purchase_items`
- `batches`, `inventory`, `sales`, `sale_items`, `payments`
- `expense_categories`, `expenses`
- `cash_accounts`, `cash_transactions`, `notifications`

## Local development

For local testing without subdomains, send the header:

```
X-Tenant: pharmacy1
```

Example with curl:

```bash
curl -H "X-Tenant: pharmacy1" http://localhost:3000/api/products
curl -X POST -H "X-Tenant: pharmacy1" -H "Content-Type: application/json" \
  -d '{"name":"Paracetamol 500mg","genericName":"Paracetamol","unit":"strip"}' \
  http://localhost:3000/api/products
```
