/**
 * One-shot: create missing tenant.inventory for schemas listed below.
 * Matches TenantService.ensureInventoryTable DDL.
 */
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const SCHEMAS = ['sadaa', 'wakiil'];

function ddl(schema) {
  return `
CREATE TABLE IF NOT EXISTS "${schema}"."inventory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES "${schema}"."products"(id),
  branch_id UUID REFERENCES "${schema}"."branches"(id),
  quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON "${schema}"."inventory"(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "${schema}"."inventory"(product_id, branch_id);
`;
}

const url =
  process.env.DATABASE_URL_LOCAL ??
  process.env.DATABASE_URL_STAGING ??
  process.env.DATABASE_URL;

if (!url) {
  console.error('Set DATABASE_URL_LOCAL (or DATABASE_URL) in .env');
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

try {
  for (const s of SCHEMAS) {
    await client.query(ddl(s));
    console.log(`OK: inventory ensured for "${s}"`);
  }
  const r = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = ANY($1::text[])
      AND table_name = 'inventory'
    ORDER BY 1
  `, [SCHEMAS]);
  console.log('Verification:', r.rows);
} finally {
  await client.end();
}
