-- UOM pricing source-of-truth additions.
-- Costs are tracked per product/UOM and per product/supplier/UOM.

ALTER TABLE "tenant_template"."product_uom_prices"
  ADD COLUMN IF NOT EXISTS "initial_cost_price" NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS "last_purchase_cost" NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS "last_purchase_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "last_purchase_id" UUID,
  ADD COLUMN IF NOT EXISTS "last_purchase_item_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_uom_prices_last_purchase_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."product_uom_prices"
      ADD CONSTRAINT "product_uom_prices_last_purchase_id_fkey"
      FOREIGN KEY ("last_purchase_id") REFERENCES "tenant_template"."Purchase"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_uom_prices_last_purchase_item_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."product_uom_prices"
      ADD CONSTRAINT "product_uom_prices_last_purchase_item_id_fkey"
      FOREIGN KEY ("last_purchase_item_id") REFERENCES "tenant_template"."PurchaseItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "tenant_template"."product_uom_prices"
SET "initial_cost_price" = COALESCE("initial_cost_price", "cost_price")
WHERE "cost_price" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tenant_template"."product_supplier_uom_costs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "uom_id" UUID NOT NULL,
  "current_cost_price" NUMERIC(14,4),
  "last_purchase_cost" NUMERIC(14,4),
  "last_purchase_at" TIMESTAMP(6),
  "last_purchase_id" UUID,
  "last_purchase_item_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_supplier_uom_costs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_supplier_uom_costs_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_supplier_uom_costs_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "tenant_template"."Supplier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_supplier_uom_costs_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_supplier_uom_costs_purchase_id_fkey"
    FOREIGN KEY ("last_purchase_id") REFERENCES "tenant_template"."Purchase"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "product_supplier_uom_costs_purchase_item_id_fkey"
    FOREIGN KEY ("last_purchase_item_id") REFERENCES "tenant_template"."PurchaseItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_supplier_uom_costs_product_supplier_uom_uq"
  ON "tenant_template"."product_supplier_uom_costs"("product_id", "supplier_id", "uom_id");
CREATE INDEX IF NOT EXISTS "idx_product_supplier_uom_costs_lookup"
  ON "tenant_template"."product_supplier_uom_costs"("supplier_id", "product_id", "uom_id");
CREATE INDEX IF NOT EXISTS "idx_product_supplier_uom_costs_product_uom"
  ON "tenant_template"."product_supplier_uom_costs"("product_id", "uom_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."supplier_price_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "uom_id" UUID NOT NULL,
  "purchase_id" UUID,
  "purchase_item_id" UUID,
  "old_cost_price" NUMERIC(14,4),
  "new_cost_price" NUMERIC(14,4) NOT NULL,
  "entered_quantity" NUMERIC(14,4),
  "base_quantity" INTEGER,
  "conversion_factor_snapshot" NUMERIC(18,6),
  "purchase_date" DATE,
  "source" VARCHAR(50) NOT NULL DEFAULT 'purchase_invoice',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_price_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_price_history_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_price_history_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "tenant_template"."Supplier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_price_history_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_price_history_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "tenant_template"."Purchase"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "supplier_price_history_purchase_item_id_fkey"
    FOREIGN KEY ("purchase_item_id") REFERENCES "tenant_template"."PurchaseItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_supplier_price_history_lookup"
  ON "tenant_template"."supplier_price_history"("product_id", "supplier_id", "uom_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_supplier_price_history_purchase"
  ON "tenant_template"."supplier_price_history"("purchase_id");

ALTER TABLE "tenant_template"."PurchaseItem"
  ADD COLUMN IF NOT EXISTS "update_selling_price" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'tenant_template'
      AND table_name = 'ReturnVoucher'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'tenant_template'
      AND table_name = 'return_vouchers'
  ) THEN
    ALTER TABLE "tenant_template"."ReturnVoucher" RENAME TO "return_vouchers";
  END IF;
END $$;

ALTER TABLE "tenant_template"."return_vouchers"
  ADD COLUMN IF NOT EXISTS "uom_id" UUID,
  ADD COLUMN IF NOT EXISTS "entered_quantity" NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS "conversion_factor_snapshot" NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tenant_template"."SaleReturnItem"
  ADD COLUMN IF NOT EXISTS "uom_id" UUID,
  ADD COLUMN IF NOT EXISTS "entered_quantity" NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS "conversion_factor_snapshot" NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_quantity" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'return_vouchers_uom_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."return_vouchers"
      ADD CONSTRAINT "return_vouchers_uom_id_fkey"
      FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SaleReturnItem_uom_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturnItem"
      ADD CONSTRAINT "SaleReturnItem_uom_id_fkey"
      FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_return_vouchers_uom_id"
  ON "tenant_template"."return_vouchers"("uom_id");
CREATE INDEX IF NOT EXISTS "idx_sale_return_items_uom_id"
  ON "tenant_template"."SaleReturnItem"("uom_id");

UPDATE "tenant_template"."return_vouchers" rv
SET "uom_id" = COALESCE(rv."uom_id", si."uom_id"),
    "entered_quantity" = COALESCE(rv."entered_quantity", rv."quantity"),
    "conversion_factor_snapshot" = COALESCE(NULLIF(rv."conversion_factor_snapshot", 0), si."conversion_factor_snapshot", 1),
    "base_quantity" = COALESCE(NULLIF(rv."base_quantity", 0), rv."quantity")
FROM "tenant_template"."SaleItem" si
WHERE si."id" = rv."sale_item_id";

UPDATE "tenant_template"."SaleReturnItem" sri
SET "uom_id" = COALESCE(sri."uom_id", si."uom_id"),
    "entered_quantity" = COALESCE(sri."entered_quantity", sri."quantity"),
    "conversion_factor_snapshot" = COALESCE(NULLIF(sri."conversion_factor_snapshot", 0), si."conversion_factor_snapshot", 1),
    "base_quantity" = COALESCE(NULLIF(sri."base_quantity", 0), sri."quantity")
FROM "tenant_template"."SaleItem" si
WHERE si."id" = sri."sale_item_id";
