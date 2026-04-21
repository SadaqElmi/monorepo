-- Branch-scoped batches
ALTER TABLE "tenant_template"."Batch"
ADD COLUMN IF NOT EXISTS "branch_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Batch_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."Batch"
    ADD CONSTRAINT "Batch_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Batch_branch_id_product_id_expiry_date_created_at_idx"
ON "tenant_template"."Batch"("branch_id", "product_id", "expiry_date", "created_at");

-- Trace purchase line to generated batch
ALTER TABLE "tenant_template"."PurchaseItem"
ADD COLUMN IF NOT EXISTS "batch_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PurchaseItem_batch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."PurchaseItem"
    ADD CONSTRAINT "PurchaseItem_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."Batch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- One inventory row per product/branch
CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_product_id_branch_id_key"
ON "tenant_template"."Inventory"("product_id", "branch_id");

-- Sale returns
CREATE TABLE IF NOT EXISTS "tenant_template"."SaleReturn" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" UUID NOT NULL,
  "branch_id" UUID,
  "reason" TEXT,
  "return_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReturn_sale_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturn"
    ADD CONSTRAINT "SaleReturn_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReturn_branch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturn"
    ADD CONSTRAINT "SaleReturn_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaleReturn_sale_id_idx" ON "tenant_template"."SaleReturn"("sale_id");
CREATE INDEX IF NOT EXISTS "SaleReturn_return_date_idx" ON "tenant_template"."SaleReturn"("return_date");

CREATE TABLE IF NOT EXISTS "tenant_template"."SaleReturnItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_return_id" UUID NOT NULL,
  "product_id" UUID,
  "batch_id" UUID,
  "sale_item_id" UUID,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReturnItem_sale_return_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturnItem"
    ADD CONSTRAINT "SaleReturnItem_sale_return_id_fkey"
    FOREIGN KEY ("sale_return_id") REFERENCES "tenant_template"."SaleReturn"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReturnItem_product_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturnItem"
    ADD CONSTRAINT "SaleReturnItem_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReturnItem_batch_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturnItem"
    ADD CONSTRAINT "SaleReturnItem_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."Batch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReturnItem_sale_item_id_fkey'
  ) THEN
    ALTER TABLE "tenant_template"."SaleReturnItem"
    ADD CONSTRAINT "SaleReturnItem_sale_item_id_fkey"
    FOREIGN KEY ("sale_item_id") REFERENCES "tenant_template"."SaleItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaleReturnItem_sale_return_id_idx"
ON "tenant_template"."SaleReturnItem"("sale_return_id");
