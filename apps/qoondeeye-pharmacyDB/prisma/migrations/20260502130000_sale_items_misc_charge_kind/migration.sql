-- POS manual charges: Member card / Delivery / Tailor (no inventory product)

DO $$
BEGIN
  IF to_regclass('tenant_template."SaleItem"') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."SaleItem"
      ADD COLUMN IF NOT EXISTS "misc_charge_kind" VARCHAR(32);

    ALTER TABLE "tenant_template"."SaleItem"
      ALTER COLUMN "product_id" DROP NOT NULL;
  END IF;
END $$;
