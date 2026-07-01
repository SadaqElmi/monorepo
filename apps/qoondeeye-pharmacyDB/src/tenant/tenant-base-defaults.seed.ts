import { createPgPool } from '../prisma/create-pg-adapter';

/** Idempotent roles, permissions, Main Branch, uoms, and price groups for a tenant database. */
export async function seedTenantBaseDefaults(databaseUrl: string): Promise<void> {
  const pool = createPgPool(databaseUrl, {
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 20_000,
  });
  try {
    await pool.query(`
INSERT INTO roles (name, is_system_role)
VALUES ('admin', true), ('manager', true), ('pharmacist', true), ('cashier', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name)
VALUES
  ('create_product'), ('edit_product'), ('delete_product'),
  ('view_products'), ('view_sales'), ('create_sale'),
  ('view_purchases'), ('create_purchase'), ('view_roles'),
  ('view_pos_terminals'), ('manage_pos_terminals')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO branches (name, code)
SELECT 'Main Branch', 'MAIN'
WHERE NOT EXISTS (SELECT 1 FROM branches);

INSERT INTO uoms (code, name, symbol)
VALUES ('PCS', 'Piece', 'PCS'), ('TAB', 'Tablet', 'TAB')
ON CONFLICT (code) DO NOTHING;

INSERT INTO price_groups (code, name, is_default, active)
VALUES ('RETAIL', 'Retail', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;`);
  } finally {
    await pool.end();
  }
}
