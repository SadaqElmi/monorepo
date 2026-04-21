-- Global categories: branch_id stays nullable (NULL = tenant-wide).
-- Optional hierarchy: parent_id → product_categories(id).

DO $$
BEGIN
  IF to_regclass('tenant_template.product_categories') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."product_categories"
      ADD COLUMN IF NOT EXISTS "parent_id" UUID;
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
      AND c.conname = 'product_categories_parent_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."product_categories"
      ADD CONSTRAINT "product_categories_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "tenant_template"."product_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "product_categories_parent_id_idx"
  ON "tenant_template"."product_categories"("parent_id");
