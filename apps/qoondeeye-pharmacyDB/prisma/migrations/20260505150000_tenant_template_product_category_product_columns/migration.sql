-- After 20260308120631_data, tenant_template uses PascalCase table names (Product, ProductCategory, Branch).
-- Migrations that targeted snake_case names (products, product_categories, branches) no-op'd; restore columns.

DO $$
BEGIN
  IF to_regclass('tenant_template."ProductCategory"') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."ProductCategory"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID,
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template."Product"') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."Product"
      ADD COLUMN IF NOT EXISTS "branch_id" UUID,
      ADD COLUMN IF NOT EXISTS "strength" VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "formulation" VARCHAR(100);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template."ProductCategory"') IS NULL OR to_regclass('tenant_template."Branch"') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'ProductCategory'
      AND c.conname = 'ProductCategory_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."ProductCategory"
      ADD CONSTRAINT "ProductCategory_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template."Product"') IS NULL OR to_regclass('tenant_template."Branch"') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'Product'
      AND c.conname = 'Product_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."Product"
      ADD CONSTRAINT "Product_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProductCategory_branch_id_idx"
  ON "tenant_template"."ProductCategory"("branch_id");

CREATE INDEX IF NOT EXISTS "Product_branch_id_idx"
  ON "tenant_template"."Product"("branch_id");
