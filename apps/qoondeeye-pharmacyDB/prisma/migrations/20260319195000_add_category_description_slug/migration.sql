-- Add optional fields to product_categories (tenant template)
-- - description (TEXT)
-- - slug (VARCHAR)

DO $$
BEGIN
  IF to_regclass('tenant_template.product_categories') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."product_categories"
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);
  END IF;
END $$;

