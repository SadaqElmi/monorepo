-- Add branch isolation columns to products + product_categories (tenant template)
-- Runtime middleware will also ensure these exist for existing tenant schemas.

DO $$
BEGIN
  IF to_regclass('tenant_template.products') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."products"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID;
  END IF;

  IF to_regclass('tenant_template.product_categories') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."product_categories"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID;
  END IF;
END $$;

-- Add foreign keys only if they don't already exist (name-based).
DO $$
BEGIN
  IF to_regclass('tenant_template.products') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'products'
      AND c.conname = 'products_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."products"
      ADD CONSTRAINT "products_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template.product_categories') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'product_categories'
      AND c.conname = 'product_categories_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."product_categories"
      ADD CONSTRAINT "product_categories_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Helpful indexes for filtering.
DO $$
BEGIN
  IF to_regclass('tenant_template.products') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "products_branch_id_idx"
      ON "tenant_template"."products"("branch_id");
  END IF;
  IF to_regclass('tenant_template.product_categories') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "product_categories_branch_id_idx"
      ON "tenant_template"."product_categories"("branch_id");
  END IF;
END $$;

