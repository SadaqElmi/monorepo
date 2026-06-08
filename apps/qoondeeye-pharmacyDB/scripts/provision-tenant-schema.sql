-- Provision tenant schema when it exists but has no tables (e.g. wakiil_123).
-- Run with: psql -v schema_name=wakiil_123 -f scripts/provision-tenant-schema.sql
-- Or replace :schema_name below with your schema name and run in your SQL client.

-- Create schema if missing (optional; skip if you know it exists)
CREATE SCHEMA IF NOT EXISTS "wakiil_123";

-- Tables (IF NOT EXISTS so safe to re-run)
CREATE TABLE IF NOT EXISTS "wakiil_123"."roles" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."permissions" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."branches" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."users" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200),
  email VARCHAR(200) UNIQUE,
  password TEXT,
  role_id UUID REFERENCES "wakiil_123"."roles"(id),
  branch_id UUID REFERENCES "wakiil_123"."branches"(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."product_categories" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."products" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  barcode VARCHAR(100),
  strength VARCHAR(100),
  formulation VARCHAR(100),
  category_id UUID REFERENCES "wakiil_123"."product_categories"(id),
  unit VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON "wakiil_123"."products"(barcode);
CREATE TABLE IF NOT EXISTS "wakiil_123"."uoms" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(32),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uoms_code_uq UNIQUE(code)
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."product_uoms" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "wakiil_123"."products"(id) ON DELETE CASCADE,
  uom_id UUID NOT NULL REFERENCES "wakiil_123"."uoms"(id),
  conversion_factor_to_base NUMERIC(18,6) NOT NULL DEFAULT 1,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  is_purchase_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_sales_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_pos_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_uoms_product_uom_uq UNIQUE(product_id, uom_id),
  CONSTRAINT product_uoms_factor_positive CHECK (conversion_factor_to_base > 0),
  CONSTRAINT product_uoms_base_factor_one CHECK (is_base IS FALSE OR conversion_factor_to_base = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_base_per_product
  ON "wakiil_123"."product_uoms"(product_id)
  WHERE is_base IS TRUE AND is_active IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_purchase_default_per_product
  ON "wakiil_123"."product_uoms"(product_id)
  WHERE is_purchase_default IS TRUE AND is_active IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_sales_default_per_product
  ON "wakiil_123"."product_uoms"(product_id)
  WHERE is_sales_default IS TRUE AND is_active IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_pos_default_per_product
  ON "wakiil_123"."product_uoms"(product_id)
  WHERE is_pos_default IS TRUE AND is_active IS TRUE;
CREATE INDEX IF NOT EXISTS idx_product_uoms_product
  ON "wakiil_123"."product_uoms"(product_id);
CREATE INDEX IF NOT EXISTS idx_product_uoms_uom
  ON "wakiil_123"."product_uoms"(uom_id);
CREATE TABLE IF NOT EXISTS "wakiil_123"."product_uom_prices" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "wakiil_123"."products"(id) ON DELETE CASCADE,
  uom_id UUID NOT NULL REFERENCES "wakiil_123"."uoms"(id),
  selling_price NUMERIC(12,4),
  cost_price NUMERIC(12,4),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS product_uom_prices_active_uq
  ON "wakiil_123"."product_uom_prices"(product_id, uom_id)
  WHERE active IS TRUE;
CREATE INDEX IF NOT EXISTS idx_product_uom_prices_product_uom
  ON "wakiil_123"."product_uom_prices"(product_id, uom_id);
CREATE TABLE IF NOT EXISTS "wakiil_123"."product_uom_barcodes" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "wakiil_123"."products"(id) ON DELETE CASCADE,
  uom_id UUID NOT NULL REFERENCES "wakiil_123"."uoms"(id),
  barcode VARCHAR(100) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS product_uom_barcodes_active_barcode_uq
  ON "wakiil_123"."product_uom_barcodes"(barcode)
  WHERE active IS TRUE;
CREATE INDEX IF NOT EXISTS idx_product_uom_barcodes_product_uom
  ON "wakiil_123"."product_uom_barcodes"(product_id, uom_id);
CREATE TABLE IF NOT EXISTS "wakiil_123"."suppliers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  supplier_type VARCHAR(20) NOT NULL DEFAULT 'local',
  country VARCHAR(100),
  city VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT suppliers_supplier_type_check CHECK (supplier_type IN ('local', 'international'))
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."product_suppliers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "wakiil_123"."products"(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES "wakiil_123"."suppliers"(id) ON DELETE CASCADE,
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  last_cost_price NUMERIC(10,2),
  supplier_item_code VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_product_supplier_uq
  ON "wakiil_123"."product_suppliers"(product_id, supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_one_preferred_per_product
  ON "wakiil_123"."product_suppliers"(product_id)
  WHERE is_preferred;
CREATE INDEX IF NOT EXISTS idx_product_suppliers_product_preferred
  ON "wakiil_123"."product_suppliers"(product_id, is_preferred);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_product
  ON "wakiil_123"."product_suppliers"(supplier_id, product_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_type_active_name
  ON "wakiil_123"."suppliers"(supplier_type, active, name);
CREATE TABLE IF NOT EXISTS "wakiil_123"."customers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."purchases" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES "wakiil_123"."suppliers"(id),
  branch_id UUID REFERENCES "wakiil_123"."branches"(id),
  invoice_number VARCHAR(100),
  total_amount NUMERIC(12,2),
  purchase_date DATE,
  on_credit BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."supplier_payments" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES "wakiil_123"."branches"(id),
  supplier_id UUID NOT NULL REFERENCES "wakiil_123"."suppliers"(id),
  amount NUMERIC(14,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference VARCHAR(255),
  notes TEXT,
  payment_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_branch ON "wakiil_123"."supplier_payments"(branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON "wakiil_123"."supplier_payments"(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_branch_date
  ON "wakiil_123"."purchases"(supplier_id, branch_id, purchase_date DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS "wakiil_123"."purchase_items" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES "wakiil_123"."purchases"(id) ON DELETE CASCADE,
  product_id UUID REFERENCES "wakiil_123"."products"(id),
  quantity INTEGER,
  uom_id UUID REFERENCES "wakiil_123"."uoms"(id),
  conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1,
  base_quantity INTEGER NOT NULL DEFAULT 0,
  base_unit_cost NUMERIC(12,4),
  cost_price NUMERIC(10,2),
  selling_price NUMERIC(10,2),
  expiry_date DATE
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."batches" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES "wakiil_123"."products"(id),
  batch_number VARCHAR(100),
  expiry_date DATE,
  quantity INTEGER,
  cost_price NUMERIC(10,2),
  selling_price NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON "wakiil_123"."batches"(expiry_date);
CREATE TABLE IF NOT EXISTS "wakiil_123"."inventory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES "wakiil_123"."products"(id),
  branch_id UUID REFERENCES "wakiil_123"."branches"(id),
  quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON "wakiil_123"."inventory"(product_id);
CREATE TABLE IF NOT EXISTS "wakiil_123"."sales" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES "wakiil_123"."branches"(id),
  total_amount NUMERIC(12,2),
  discount NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON "wakiil_123"."sales"(sale_date);
CREATE TABLE IF NOT EXISTS "wakiil_123"."sale_items" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES "wakiil_123"."sales"(id) ON DELETE CASCADE,
  product_id UUID REFERENCES "wakiil_123"."products"(id),
  batch_id UUID REFERENCES "wakiil_123"."batches"(id),
  quantity INTEGER,
  uom_id UUID REFERENCES "wakiil_123"."uoms"(id),
  entered_quantity NUMERIC(18,6),
  conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1,
  base_quantity INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10,2),
  total NUMERIC(10,2)
);
ALTER TABLE IF EXISTS "wakiil_123"."purchase_items"
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES "wakiil_123"."uoms"(id),
  ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_unit_cost NUMERIC(12,4);
ALTER TABLE IF EXISTS "wakiil_123"."sale_items"
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES "wakiil_123"."uoms"(id),
  ADD COLUMN IF NOT EXISTS entered_quantity NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "wakiil_123"."payments" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES "wakiil_123"."sales"(id),
  method VARCHAR(50),
  amount NUMERIC(10,2),
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."expense_categories" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  gl_account_key VARCHAR(50)
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."expenses" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES "wakiil_123"."expense_categories"(id),
  branch_id UUID REFERENCES "wakiil_123"."branches"(id),
  amount NUMERIC(12,2),
  description TEXT,
  expense_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."cash_accounts" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  type VARCHAR(50),
  balance NUMERIC(12,2) DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."cash_transactions" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES "wakiil_123"."cash_accounts"(id),
  type VARCHAR(10),
  amount NUMERIC(12,2),
  reference VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."chart_of_accounts" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES "wakiil_123"."branches"(id) ON DELETE CASCADE,
  code VARCHAR(32),
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  account_key VARCHAR(50) NOT NULL,
  is_system BOOLEAN DEFAULT TRUE,
  allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  is_interbranch BOOLEAN NOT NULL DEFAULT FALSE,
  interbranch_type VARCHAR(24) NOT NULL DEFAULT 'none',
  payment_method_key VARCHAR(50),
  parent_id UUID REFERENCES "wakiil_123"."chart_of_accounts"(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, account_key)
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_purchase
  ON "wakiil_123"."purchase_items"(product_id, purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_uom
  ON "wakiil_123"."purchase_items"(uom_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_uom
  ON "wakiil_123"."purchase_items"(product_id, uom_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_uom
  ON "wakiil_123"."sale_items"(uom_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_uom
  ON "wakiil_123"."sale_items"(product_id, uom_id);
CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_branch_payment_key_uq ON "wakiil_123"."chart_of_accounts"(branch_id, payment_method_key) WHERE payment_method_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS "wakiil_123"."journal_entries" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES "wakiil_123"."branches"(id),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  source_type VARCHAR(32) NOT NULL,
  source_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_uq ON "wakiil_123"."journal_entries"(branch_id, source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entries_branch_date_idx ON "wakiil_123"."journal_entries"(branch_id, entry_date);
CREATE TABLE IF NOT EXISTS "wakiil_123"."journal_lines" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES "wakiil_123"."journal_entries"(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES "wakiil_123"."chart_of_accounts"(id),
  debit NUMERIC(14,2) DEFAULT 0 NOT NULL,
  credit NUMERIC(14,2) DEFAULT 0 NOT NULL,
  partner_kind VARCHAR(20),
  partner_id UUID,
  CONSTRAINT journal_lines_one_side_positive CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON "wakiil_123"."journal_lines"(journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON "wakiil_123"."journal_lines"(account_id);
CREATE INDEX IF NOT EXISTS journal_lines_partner_account_entry_idx
  ON "wakiil_123"."journal_lines"(partner_kind, partner_id, account_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_entries_branch_entry_created_idx
  ON "wakiil_123"."journal_entries"(branch_id, entry_date, created_at, id);
CREATE TABLE IF NOT EXISTS "wakiil_123"."patient_loans" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "wakiil_123"."customers"(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES "wakiil_123"."branches"(id),
  sale_id UUID REFERENCES "wakiil_123"."sales"(id) ON DELETE SET NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ongoing',
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."patient_loan_payments" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES "wakiil_123"."patient_loans"(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(50),
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."notifications" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  message TEXT,
  type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wakiil_123"."role_permissions" (
  role_id UUID REFERENCES "wakiil_123"."roles"(id),
  permission_id UUID REFERENCES "wakiil_123"."permissions"(id),
  PRIMARY KEY(role_id, permission_id)
);

-- UOM seed and legacy product.unit backfill.
INSERT INTO "wakiil_123"."uoms" (code, name, symbol)
VALUES
  ('PCS', 'Piece', 'PCS'),
  ('TAB', 'Tablet', 'TAB'),
  ('STRIP', 'Strip', 'Strip'),
  ('BOX', 'Box', 'Box'),
  ('CTN', 'Carton', 'Ctn'),
  ('BTL', 'Bottle', 'Btl')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      symbol = EXCLUDED.symbol,
      active = TRUE,
      updated_at = CURRENT_TIMESTAMP;

WITH normalized AS (
  SELECT DISTINCT
    CASE
      WHEN p.unit IS NULL OR btrim(p.unit) = '' THEN 'PCS'
      WHEN upper(btrim(p.unit)) IN ('PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH') THEN 'PCS'
      WHEN upper(btrim(p.unit)) IN ('TAB', 'TABS', 'TABLET', 'TABLETS') THEN 'TAB'
      WHEN upper(btrim(p.unit)) IN ('STRIP', 'STRIPS') THEN 'STRIP'
      WHEN upper(btrim(p.unit)) IN ('BOX', 'BOXES') THEN 'BOX'
      WHEN upper(btrim(p.unit)) IN ('CTN', 'CARTON', 'CARTONS') THEN 'CTN'
      WHEN upper(btrim(p.unit)) IN ('BTL', 'BOTTLE', 'BOTTLES') THEN 'BTL'
      ELSE upper(regexp_replace(btrim(p.unit), '[^A-Za-z0-9]+', '_', 'g'))
    END AS code,
    COALESCE(NULLIF(btrim(p.unit), ''), 'Piece') AS raw_name
  FROM "wakiil_123"."products" p
)
INSERT INTO "wakiil_123"."uoms" (code, name, symbol)
SELECT code, initcap(replace(raw_name, '_', ' ')), code
FROM normalized
WHERE code <> ''
ON CONFLICT (code) DO NOTHING;

WITH product_base AS (
  SELECT
    p.id AS product_id,
    u.id AS uom_id
  FROM "wakiil_123"."products" p
  JOIN "wakiil_123"."uoms" u ON u.code = CASE
    WHEN p.unit IS NULL OR btrim(p.unit) = '' THEN 'PCS'
    WHEN upper(btrim(p.unit)) IN ('PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH') THEN 'PCS'
    WHEN upper(btrim(p.unit)) IN ('TAB', 'TABS', 'TABLET', 'TABLETS') THEN 'TAB'
    WHEN upper(btrim(p.unit)) IN ('STRIP', 'STRIPS') THEN 'STRIP'
    WHEN upper(btrim(p.unit)) IN ('BOX', 'BOXES') THEN 'BOX'
    WHEN upper(btrim(p.unit)) IN ('CTN', 'CARTON', 'CARTONS') THEN 'CTN'
    WHEN upper(btrim(p.unit)) IN ('BTL', 'BOTTLE', 'BOTTLES') THEN 'BTL'
    ELSE upper(regexp_replace(btrim(p.unit), '[^A-Za-z0-9]+', '_', 'g'))
  END
)
INSERT INTO "wakiil_123"."product_uoms" (
  product_id, uom_id, conversion_factor_to_base,
  is_base, is_purchase_default, is_sales_default, is_pos_default, is_active
)
SELECT product_id, uom_id, 1, TRUE, TRUE, TRUE, TRUE, TRUE
FROM product_base
ON CONFLICT (product_id, uom_id) DO UPDATE
  SET conversion_factor_to_base = 1,
      is_base = TRUE,
      is_purchase_default = TRUE,
      is_sales_default = TRUE,
      is_pos_default = TRUE,
      is_active = TRUE,
      updated_at = CURRENT_TIMESTAMP;

UPDATE "wakiil_123"."purchase_items"
SET base_quantity = COALESCE(quantity, 0)
WHERE COALESCE(base_quantity, 0) = 0;

UPDATE "wakiil_123"."sale_items"
SET base_quantity = COALESCE(quantity, 0),
    entered_quantity = COALESCE(entered_quantity, COALESCE(quantity, 0))
WHERE COALESCE(base_quantity, 0) = 0;

-- Seed roles and permissions (ignore if already present)
INSERT INTO "wakiil_123"."roles" (name) VALUES
  ('admin'),
  ('manager'),
  ('pharmacist'),
  ('cashier')
ON CONFLICT (name) DO NOTHING;

INSERT INTO "wakiil_123"."permissions" (name) VALUES
  ('create_product'),
  ('edit_product'),
  ('delete_product'),
  ('view_reports'),
  ('manage_users')
ON CONFLICT (name) DO NOTHING;

INSERT INTO "wakiil_123"."role_permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "wakiil_123"."roles" r
CROSS JOIN "wakiil_123"."permissions" p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;
