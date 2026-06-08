-- ERP Unit of Measure system.
-- Tenant schemas store all inventory and batch quantities in the product base UOM.

CREATE TABLE IF NOT EXISTS "tenant_template"."uoms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "symbol" VARCHAR(32),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "uoms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uoms_code_key"
  ON "tenant_template"."uoms"("code");

CREATE TABLE IF NOT EXISTS "tenant_template"."product_uoms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "uom_id" UUID NOT NULL,
  "conversion_factor_to_base" NUMERIC(18,6) NOT NULL,
  "is_base" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_purchase_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_sales_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_pos_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_uoms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_uoms_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_uoms_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_uoms_factor_positive"
    CHECK ("conversion_factor_to_base" > 0),
  CONSTRAINT "product_uoms_base_factor_one"
    CHECK ((NOT "is_base") OR "conversion_factor_to_base" = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_uoms_product_uom_uq"
  ON "tenant_template"."product_uoms"("product_id", "uom_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_uoms_one_base_per_product"
  ON "tenant_template"."product_uoms"("product_id")
  WHERE "is_base" IS TRUE AND "is_active" IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS "product_uoms_one_purchase_default"
  ON "tenant_template"."product_uoms"("product_id")
  WHERE "is_purchase_default" IS TRUE AND "is_active" IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS "product_uoms_one_sales_default"
  ON "tenant_template"."product_uoms"("product_id")
  WHERE "is_sales_default" IS TRUE AND "is_active" IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS "product_uoms_one_pos_default"
  ON "tenant_template"."product_uoms"("product_id")
  WHERE "is_pos_default" IS TRUE AND "is_active" IS TRUE;
CREATE INDEX IF NOT EXISTS "idx_product_uoms_product_id"
  ON "tenant_template"."product_uoms"("product_id");
CREATE INDEX IF NOT EXISTS "idx_product_uoms_uom_id"
  ON "tenant_template"."product_uoms"("uom_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."product_uom_prices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "uom_id" UUID NOT NULL,
  "selling_price" NUMERIC(14,2),
  "cost_price" NUMERIC(14,4),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_uom_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_uom_prices_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_uom_prices_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_uom_prices_active_product_uom_uq"
  ON "tenant_template"."product_uom_prices"("product_id", "uom_id")
  WHERE "active" IS TRUE;
CREATE INDEX IF NOT EXISTS "idx_product_uom_prices_product_uom"
  ON "tenant_template"."product_uom_prices"("product_id", "uom_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."product_uom_barcodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "uom_id" UUID NOT NULL,
  "barcode" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_uom_barcodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_uom_barcodes_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_uom_barcodes_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_uom_barcodes_active_barcode_uq"
  ON "tenant_template"."product_uom_barcodes"("barcode")
  WHERE "active" IS TRUE AND btrim("barcode") <> '';
CREATE INDEX IF NOT EXISTS "idx_product_uom_barcodes_barcode"
  ON "tenant_template"."product_uom_barcodes"("barcode");
CREATE INDEX IF NOT EXISTS "idx_product_uom_barcodes_product_uom"
  ON "tenant_template"."product_uom_barcodes"("product_id", "uom_id");

ALTER TABLE "tenant_template"."PurchaseItem"
  ADD COLUMN IF NOT EXISTS "uom_id" UUID,
  ADD COLUMN IF NOT EXISTS "conversion_factor_snapshot" NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_unit_cost" NUMERIC(14,4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_items_uom_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."PurchaseItem"
      ADD CONSTRAINT "purchase_items_uom_id_fkey"
      FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_purchase_items_uom_id"
  ON "tenant_template"."PurchaseItem"("uom_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_items_product_uom"
  ON "tenant_template"."PurchaseItem"("product_id", "uom_id");

ALTER TABLE "tenant_template"."SaleItem"
  ADD COLUMN IF NOT EXISTS "uom_id" UUID,
  ADD COLUMN IF NOT EXISTS "entered_quantity" NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS "conversion_factor_snapshot" NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_quantity" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_items_uom_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."SaleItem"
      ADD CONSTRAINT "sale_items_uom_id_fkey"
      FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_sale_items_uom_id"
  ON "tenant_template"."SaleItem"("uom_id");
CREATE INDEX IF NOT EXISTS "idx_sale_items_product_uom"
  ON "tenant_template"."SaleItem"("product_id", "uom_id");

INSERT INTO "tenant_template"."uoms" ("code", "name", "symbol")
VALUES
  ('PCS', 'Piece', 'PCS'),
  ('TAB', 'Tablet', 'TAB'),
  ('STRIP', 'Strip', 'Strip'),
  ('BOX', 'Box', 'Box'),
  ('CTN', 'Carton', 'Ctn'),
  ('BTL', 'Bottle', 'Btl')
ON CONFLICT ("code") DO UPDATE
  SET "name" = EXCLUDED."name",
      "symbol" = EXCLUDED."symbol",
      "active" = TRUE,
      "updated_at" = CURRENT_TIMESTAMP;

WITH normalized AS (
  SELECT DISTINCT
    CASE
      WHEN p.unit IS NULL OR btrim(p.unit) = '' THEN 'PCS'
      WHEN upper(btrim(p.unit)) IN ('PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH') THEN 'PCS'
      WHEN upper(btrim(p.unit)) IN ('TAB', 'TABS', 'TABLET', 'TABLETS') THEN 'TAB'
      WHEN upper(btrim(p.unit)) IN ('STRIP', 'STRIPS') THEN 'STRIP'
      WHEN upper(btrim(p.unit)) IN ('BOX', 'BOXES') THEN 'BOX'
      WHEN upper(btrim(p.unit)) IN ('CTN', 'CARTON', 'CARTONS') THEN 'CTN'
      WHEN upper(btrim(p.unit)) IN ('BTL', 'BOTTLE', 'BOTTLES') THEN 'BTL'
      ELSE upper(regexp_replace(btrim(p.unit), '[^A-Za-z0-9]+', '_', 'g'))
    END AS code,
    COALESCE(NULLIF(btrim(p.unit), ''), 'Piece') AS raw_name
  FROM "tenant_template"."Product" p
)
INSERT INTO "tenant_template"."uoms" ("code", "name", "symbol")
SELECT code, initcap(replace(raw_name, '_', ' ')), code
FROM normalized
WHERE code <> ''
ON CONFLICT ("code") DO NOTHING;

WITH product_base AS (
  SELECT
    p.id AS product_id,
    u.id AS uom_id,
    u.code,
    u.symbol
  FROM "tenant_template"."Product" p
  JOIN "tenant_template"."uoms" u ON u.code = CASE
    WHEN p.unit IS NULL OR btrim(p.unit) = '' THEN 'PCS'
    WHEN upper(btrim(p.unit)) IN ('PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH') THEN 'PCS'
    WHEN upper(btrim(p.unit)) IN ('TAB', 'TABS', 'TABLET', 'TABLETS') THEN 'TAB'
    WHEN upper(btrim(p.unit)) IN ('STRIP', 'STRIPS') THEN 'STRIP'
    WHEN upper(btrim(p.unit)) IN ('BOX', 'BOXES') THEN 'BOX'
    WHEN upper(btrim(p.unit)) IN ('CTN', 'CARTON', 'CARTONS') THEN 'CTN'
    WHEN upper(btrim(p.unit)) IN ('BTL', 'BOTTLE', 'BOTTLES') THEN 'BTL'
    ELSE upper(regexp_replace(btrim(p.unit), '[^A-Za-z0-9]+', '_', 'g'))
  END
)
INSERT INTO "tenant_template"."product_uoms" (
  "product_id", "uom_id", "conversion_factor_to_base",
  "is_base", "is_purchase_default", "is_sales_default", "is_pos_default", "is_active"
)
SELECT product_id, uom_id, 1, TRUE, TRUE, TRUE, TRUE, TRUE
FROM product_base
ON CONFLICT ("product_id", "uom_id") DO UPDATE
  SET "conversion_factor_to_base" = 1,
      "is_base" = TRUE,
      "is_purchase_default" = TRUE,
      "is_sales_default" = TRUE,
      "is_pos_default" = TRUE,
      "is_active" = TRUE,
      "updated_at" = CURRENT_TIMESTAMP;

UPDATE "tenant_template"."PurchaseItem"
SET "base_quantity" = COALESCE("quantity", 0)
WHERE COALESCE("base_quantity", 0) = 0;

UPDATE "tenant_template"."SaleItem"
SET "base_quantity" = COALESCE("quantity", 0),
    "entered_quantity" = COALESCE("entered_quantity", COALESCE("quantity", 0))
WHERE COALESCE("base_quantity", 0) = 0;

ALTER TABLE IF EXISTS "tenant_template"."stock_transfer_items"
  ADD COLUMN IF NOT EXISTS "uom_id" UUID,
  ADD COLUMN IF NOT EXISTS "conversion_factor_snapshot" NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_quantity" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('"tenant_template"."stock_transfer_items"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'stock_transfer_items_uom_id_fkey'
         AND connamespace = 'tenant_template'::regnamespace
     ) THEN
    ALTER TABLE "tenant_template"."stock_transfer_items"
      ADD CONSTRAINT "stock_transfer_items_uom_id_fkey"
      FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"tenant_template"."stock_transfer_items"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "idx_stock_transfer_items_uom"
      ON "tenant_template"."stock_transfer_items"("uom_id");
    UPDATE "tenant_template"."stock_transfer_items"
    SET "base_quantity" = COALESCE("quantity", 0)
    WHERE COALESCE("base_quantity", 0) = 0;
  END IF;
END $$;
