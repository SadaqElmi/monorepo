-- Global categories: branch_id stays nullable (NULL = tenant-wide).
-- Optional hierarchy: parent_id → ProductCategory(id).
-- Table name is "ProductCategory" (see 20260308120631_data); old snake_case name no longer exists.

DO $$
BEGIN
  IF to_regclass('tenant_template."ProductCategory"') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."ProductCategory"
      ADD COLUMN IF NOT EXISTS "parent_id" UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('tenant_template."ProductCategory"') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND r.relname = 'ProductCategory'
      AND c.conname = 'ProductCategory_parent_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."ProductCategory"
      ADD CONSTRAINT "ProductCategory_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "tenant_template"."ProductCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProductCategory_parent_id_idx"
  ON "tenant_template"."ProductCategory"("parent_id");
