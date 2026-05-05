-- Branch isolation hardening for tenant template schema.
-- 1) Enforce branch assignment for restricted roles.
-- 2) Add branch-centric indexes used by branch-scoped CRUD/reporting queries.

CREATE SCHEMA IF NOT EXISTS "tenant_template";

CREATE TABLE IF NOT EXISTS "tenant_template"."branches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255),
  "phone" VARCHAR(50),
  "address" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- Accounting tables for tenant_template (match runtime TenantService.ensureAccountingSchema); required before indexes below.
CREATE TABLE IF NOT EXISTS "tenant_template"."chart_of_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL REFERENCES "tenant_template"."branches"("id") ON DELETE CASCADE,
  "code" VARCHAR(32),
  "name" VARCHAR(255) NOT NULL,
  "account_type" VARCHAR(20) NOT NULL,
  "account_key" VARCHAR(50) NOT NULL,
  "is_system" BOOLEAN DEFAULT TRUE,
  "payment_method_key" VARCHAR(50),
  "parent_id" UUID REFERENCES "tenant_template"."chart_of_accounts"("id"),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("branch_id", "account_key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chart_of_accounts_branch_payment_key_uq"
  ON "tenant_template"."chart_of_accounts"("branch_id", "payment_method_key")
  WHERE "payment_method_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tenant_template"."journal_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL REFERENCES "tenant_template"."branches"("id"),
  "entry_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "description" TEXT,
  "source_type" VARCHAR(32) NOT NULL,
  "source_id" UUID,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_source_uq"
  ON "tenant_template"."journal_entries"("branch_id", "source_type", "source_id")
  WHERE "source_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "journal_entries_branch_date_idx"
  ON "tenant_template"."journal_entries"("branch_id", "entry_date");

CREATE TABLE IF NOT EXISTS "tenant_template"."journal_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "journal_entry_id" UUID NOT NULL REFERENCES "tenant_template"."journal_entries"("id") ON DELETE CASCADE,
  "account_id" UUID NOT NULL REFERENCES "tenant_template"."chart_of_accounts"("id"),
  "debit" NUMERIC(14,2) DEFAULT 0 NOT NULL,
  "credit" NUMERIC(14,2) DEFAULT 0 NOT NULL,
  CONSTRAINT "journal_lines_one_side_positive" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  )
);

CREATE INDEX IF NOT EXISTS "journal_lines_entry_idx"
  ON "tenant_template"."journal_lines"("journal_entry_id");

CREATE INDEX IF NOT EXISTS "journal_lines_account_idx"
  ON "tenant_template"."journal_lines"("account_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" UUID REFERENCES "tenant_template"."branches"("id"),
  "actor_user_id" UUID,
  "table_name" VARCHAR(128) NOT NULL,
  "record_id" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "old_payload" JSONB,
  "new_payload" JSONB,
  "entity_type" VARCHAR(128),
  "entity_id" TEXT,
  "user_id" UUID,
  "before_json" JSONB,
  "after_json" JSONB,
  "event_ts" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "prev_hash" VARCHAR(128),
  "audit_hash" VARCHAR(128),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_table_record"
  ON "tenant_template"."audit_logs"("table_name", "record_id");

CREATE OR REPLACE FUNCTION tenant_template.enforce_user_branch_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text;
BEGIN
  role_name := NULL;

  IF NEW.role_id IS NOT NULL THEN
    SELECT lower(r.name)
    INTO role_name
    FROM "tenant_template"."Role" r
    WHERE r.id = NEW.role_id;
  END IF;

  IF role_name IN ('cashier', 'staff', 'manager') AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required for role %', role_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_branch_assignment ON "tenant_template"."User";
CREATE TRIGGER trg_enforce_user_branch_assignment
BEFORE INSERT OR UPDATE ON "tenant_template"."User"
FOR EACH ROW
EXECUTE FUNCTION tenant_template.enforce_user_branch_assignment();

CREATE INDEX IF NOT EXISTS idx_users_branch_id
  ON "tenant_template"."User" (branch_id);

CREATE INDEX IF NOT EXISTS idx_sales_branch_sale_date
  ON "tenant_template"."Sale" (branch_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_branch_purchase_date
  ON "tenant_template"."Purchase" (branch_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_entry_date
  ON tenant_template.journal_entries (branch_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id
  ON tenant_template.journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_inventory_branch_product
  ON "tenant_template"."Inventory" (branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created_at
  ON tenant_template.audit_logs (branch_id, created_at DESC);
