-- Branch isolation / schema alignment migration
-- This project relies on schema-per-tenant at runtime and raw SQL.
-- Prisma migrations are used to keep migration history consistent with the
-- current Prisma datamodel and the already-updated database schema.

-- tenant_user_lookup is no longer part of the Prisma datamodel.
DROP TABLE IF EXISTS "tenant_user_lookup";

-- Ensure product strength/formulation columns exist in the tenant template.
DO $$
BEGIN
  IF to_regclass('tenant_template.products') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."products"
      ADD COLUMN IF NOT EXISTS "strength" VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "formulation" VARCHAR(100);
  END IF;
END $$;

-- Ensure branch_id column exists where branch-level isolation requires it.
DO $$
BEGIN
  IF to_regclass('tenant_template.cash_transactions') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."cash_transactions"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID;
  END IF;
  IF to_regclass('tenant_template.purchase_items') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."purchase_items"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID;
  END IF;
  IF to_regclass('tenant_template.sale_items') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."sale_items"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID;
  END IF;
END $$;

-- Add foreign keys only if they don't already exist (name-based).
DO $$
BEGIN
  IF to_regclass('tenant_template.cash_transactions') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'cash_transactions'
      AND c.conname = 'cash_transactions_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."cash_transactions"
      ADD CONSTRAINT "cash_transactions_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template.purchase_items') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'purchase_items'
      AND c.conname = 'purchase_items_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."purchase_items"
      ADD CONSTRAINT "purchase_items_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template.sale_items') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'sale_items'
      AND c.conname = 'sale_items_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."sale_items"
      ADD CONSTRAINT "sale_items_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

