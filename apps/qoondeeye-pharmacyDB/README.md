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

```bash
npm install
```

### 2. Configure database

Create a PostgreSQL database and set `DATABASE_URL_STAGING` in `.env`:

```env
DATABASE_URL_STAGING="postgresql://USER:PASSWORD@localhost:5432/pharmacare?schema=public"
```

### 3. Run migrations

```bash
npm run prisma:migrate
```

This creates the `public` and `tenant_template` schemas.

### 4. Generate Prisma client

```bash
npm run prisma:generate
```

### 5. Start the server

```bash
npm run start:dev
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

| Script                          | Description             |
| ------------------------------- | ----------------------- |
| `npm run start:dev`             | Start with hot reload   |
| `npm run build`                 | Build for production    |
| `npm run prisma:generate`       | Generate Prisma client  |
| `npm run prisma:migrate`        | Run migrations (dev)    |
| `npm run prisma:migrate:deploy` | Apply migrations (prod) |
| `npm run prisma:studio`         | Open Prisma Studio      |

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
