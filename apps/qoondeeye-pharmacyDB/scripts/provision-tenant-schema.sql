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
CREATE TABLE IF NOT EXISTS "wakiil_123"."suppliers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
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
CREATE TABLE IF NOT EXISTS "wakiil_123"."purchase_items" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES "wakiil_123"."purchases"(id) ON DELETE CASCADE,
  product_id UUID REFERENCES "wakiil_123"."products"(id),
  quantity INTEGER,
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
  price NUMERIC(10,2),
  total NUMERIC(10,2)
);
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
  is_interbranch BOOLEAN NOT NULL DEFAULT FALSE,
  interbranch_type VARCHAR(24) NOT NULL DEFAULT 'none',
  payment_method_key VARCHAR(50),
  parent_id UUID REFERENCES "wakiil_123"."chart_of_accounts"(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, account_key)
);
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
  CONSTRAINT journal_lines_one_side_positive CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON "wakiil_123"."journal_lines"(journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON "wakiil_123"."journal_lines"(account_id);
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
