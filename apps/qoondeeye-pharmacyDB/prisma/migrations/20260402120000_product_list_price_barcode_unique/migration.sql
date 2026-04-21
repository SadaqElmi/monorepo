-- Product list price + partial unique barcode (tenant_template)

DO $$
BEGIN
  IF to_regclass('tenant_template."Product"') IS NOT NULL THEN
    ALTER TABLE "tenant_template"."Product"
      ADD COLUMN IF NOT EXISTS "list_price" NUMERIC(10,2);
  END IF;
END $$;

-- Dedupe barcodes: keep one row per barcode (earliest created_at), clear others
DO $$
BEGIN
  IF to_regclass('tenant_template."Product"') IS NULL THEN
    RETURN;
  END IF;
  UPDATE "tenant_template"."Product" p
  SET barcode = NULL
  FROM (
    SELECT id
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY barcode
          ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM "tenant_template"."Product"
      WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
    ) x
    WHERE x.rn > 1
  ) dup
  WHERE p.id = dup.id;
END $$;

DROP INDEX IF EXISTS "tenant_template"."idx_products_barcode";

CREATE UNIQUE INDEX IF NOT EXISTS "products_barcode_unique_not_null"
  ON "tenant_template"."Product" ("barcode")
  WHERE barcode IS NOT NULL AND TRIM(barcode) <> '';

CREATE INDEX IF NOT EXISTS "idx_products_barcode"
  ON "tenant_template"."Product" ("barcode");
