-- Cashier PIN hash on tenant users (tenant_template)

DO $$
BEGIN
  IF to_regclass('tenant_template.users') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."users"
      ADD COLUMN IF NOT EXISTS "pin_hash" TEXT;
  END IF;
END $$;
