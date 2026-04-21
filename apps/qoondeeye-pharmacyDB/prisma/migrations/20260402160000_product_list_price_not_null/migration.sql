-- Product list_price NOT NULL with default 0 (tenant_template)

DO $$
BEGIN
  IF to_regclass('tenant_template."Product"') IS NOT NULL THEN
    UPDATE "tenant_template"."Product"
    SET list_price = 0
    WHERE list_price IS NULL;

    ALTER TABLE "tenant_template"."Product"
      ALTER COLUMN "list_price" SET DEFAULT 0;

    ALTER TABLE "tenant_template"."Product"
      ALTER COLUMN "list_price" SET NOT NULL;
  END IF;
END $$;
