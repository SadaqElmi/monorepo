# PharmaCare Backend

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
