-- Supplier Management V1: supplier metadata, product-supplier links,
-- supplier statement indexes, and supplier price-history indexes.

ALTER TABLE "tenant_template"."suppliers"
  ADD COLUMN IF NOT EXISTS "supplier_type" VARCHAR(20) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS "country" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "city" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'suppliers_supplier_type_check'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."suppliers"
      ADD CONSTRAINT "suppliers_supplier_type_check"
      CHECK ("supplier_type" IN ('local', 'international'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_template"."product_suppliers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL REFERENCES "tenant_template"."products"("id") ON DELETE CASCADE,
  "supplier_id" UUID NOT NULL REFERENCES "tenant_template"."suppliers"("id") ON DELETE CASCADE,
  "is_preferred" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_cost_price" NUMERIC(10,2),
  "supplier_item_code" VARCHAR(100),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_suppliers_product_supplier_uq"
  ON "tenant_template"."product_suppliers"("product_id", "supplier_id");

CREATE UNIQUE INDEX IF NOT EXISTS "product_suppliers_one_preferred_per_product"
  ON "tenant_template"."product_suppliers"("product_id")
  WHERE "is_preferred";

CREATE INDEX IF NOT EXISTS "idx_product_suppliers_product_preferred"
  ON "tenant_template"."product_suppliers"("product_id", "is_preferred");

CREATE INDEX IF NOT EXISTS "idx_product_suppliers_supplier_product"
  ON "tenant_template"."product_suppliers"("supplier_id", "product_id");

CREATE INDEX IF NOT EXISTS "idx_suppliers_type_active_name"
  ON "tenant_template"."suppliers"("supplier_type", "active", "name");

CREATE INDEX IF NOT EXISTS "idx_suppliers_active_name"
  ON "tenant_template"."suppliers"("active", "name");

INSERT INTO "tenant_template"."product_suppliers" AS ps (
  "product_id", "supplier_id", "is_preferred", "last_cost_price"
)
SELECT p."id", p."supplier_id", TRUE, NULL
FROM "tenant_template"."products" p
WHERE p."supplier_id" IS NOT NULL
ON CONFLICT ("product_id", "supplier_id") DO UPDATE
  SET "is_preferred" = TRUE,
      "updated_at" = CURRENT_TIMESTAMP;

WITH latest_purchase_cost AS (
  SELECT DISTINCT ON (pi."product_id", p."supplier_id")
    pi."product_id",
    p."supplier_id",
    pi."cost_price"
  FROM "tenant_template"."purchase_items" pi
  JOIN "tenant_template"."purchases" p ON p."id" = pi."purchase_id"
  WHERE pi."product_id" IS NOT NULL
    AND p."supplier_id" IS NOT NULL
  ORDER BY
    pi."product_id",
    p."supplier_id",
    p."purchase_date" DESC NULLS LAST,
    p."created_at" DESC NULLS LAST,
    pi."id" DESC
)
INSERT INTO "tenant_template"."product_suppliers" (
  "product_id", "supplier_id", "is_preferred", "last_cost_price"
)
SELECT
  lpc."product_id",
  lpc."supplier_id",
  FALSE,
  lpc."cost_price"
FROM latest_purchase_cost lpc
ON CONFLICT ("product_id", "supplier_id") DO UPDATE
  SET "last_cost_price" = COALESCE(EXCLUDED."last_cost_price", ps."last_cost_price"),
      "updated_at" = CURRENT_TIMESTAMP;

WITH latest_supplier_per_product AS (
  SELECT DISTINCT ON (pi."product_id")
    pi."product_id",
    p."supplier_id"
  FROM "tenant_template"."purchase_items" pi
  JOIN "tenant_template"."purchases" p ON p."id" = pi."purchase_id"
  WHERE pi."product_id" IS NOT NULL
    AND p."supplier_id" IS NOT NULL
  ORDER BY
    pi."product_id",
    p."purchase_date" DESC NULLS LAST,
    p."created_at" DESC NULLS LAST,
    pi."id" DESC
)
UPDATE "tenant_template"."product_suppliers" ps
SET "is_preferred" = TRUE,
    "updated_at" = CURRENT_TIMESTAMP
FROM latest_supplier_per_product latest
WHERE ps."product_id" = latest."product_id"
  AND ps."supplier_id" = latest."supplier_id"
  AND NOT EXISTS (
    SELECT 1
    FROM "tenant_template"."product_suppliers" existing
    WHERE existing."product_id" = latest."product_id"
      AND existing."is_preferred"
  );

CREATE INDEX IF NOT EXISTS "journal_lines_partner_account_entry_idx"
  ON "tenant_template"."journal_lines"("partner_kind", "partner_id", "account_id", "journal_entry_id");

CREATE INDEX IF NOT EXISTS "journal_entries_branch_entry_created_idx"
  ON "tenant_template"."journal_entries"("branch_id", "entry_date", "created_at", "id");

CREATE INDEX IF NOT EXISTS "idx_purchases_supplier_branch_date"
  ON "tenant_template"."purchases"("supplier_id", "branch_id", "purchase_date" DESC, "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_purchase_items_product_purchase"
  ON "tenant_template"."purchase_items"("product_id", "purchase_id");
