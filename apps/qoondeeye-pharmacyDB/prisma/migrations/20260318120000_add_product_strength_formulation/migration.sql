-- Add strength + formulation to products (tenant schemas)
-- Safe to run multiple times.

-- 1) Ensure tenant_template has the columns (for new tenants / baseline)
ALTER TABLE IF EXISTS "tenant_template"."products"
  ADD COLUMN IF NOT EXISTS "strength" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "formulation" VARCHAR(100);

-- 2) Backfill all existing tenant schemas that already have a products table
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT nspname AS schema_name
    FROM pg_namespace
    WHERE nspname NOT IN ('public', 'tenant_template', 'information_schema')
      AND nspname NOT LIKE 'pg_%'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = s.schema_name
        AND table_name = 'products'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.products
           ADD COLUMN IF NOT EXISTS strength VARCHAR(100),
           ADD COLUMN IF NOT EXISTS formulation VARCHAR(100);',
        s.schema_name
      );
    END IF;
  END LOOP;
END $$;

