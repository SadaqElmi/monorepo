-- Pricing management, price groups, offer lists, and POS offer metadata.

CREATE TABLE IF NOT EXISTS "tenant_template"."price_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "price_groups_code_key"
  ON "tenant_template"."price_groups"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "price_groups_one_default"
  ON "tenant_template"."price_groups"("is_default")
  WHERE "is_default" IS TRUE AND "active" IS TRUE;
CREATE INDEX IF NOT EXISTS "idx_price_groups_active"
  ON "tenant_template"."price_groups"("active");

CREATE TABLE IF NOT EXISTS "tenant_template"."product_price_group_prices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "uom_id" UUID NOT NULL,
  "price_group_id" UUID NOT NULL,
  "selling_price" NUMERIC(14,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_price_group_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_price_group_prices_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_price_group_prices_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_price_group_prices_group_id_fkey"
    FOREIGN KEY ("price_group_id") REFERENCES "tenant_template"."price_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_price_group_prices_nonnegative"
    CHECK ("selling_price" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_price_group_prices_active_uq"
  ON "tenant_template"."product_price_group_prices"("product_id", "uom_id", "price_group_id")
  WHERE "active" IS TRUE;
CREATE INDEX IF NOT EXISTS "idx_product_price_group_prices_lookup"
  ON "tenant_template"."product_price_group_prices"("product_id", "uom_id", "price_group_id");
CREATE INDEX IF NOT EXISTS "idx_product_price_group_prices_group_active"
  ON "tenant_template"."product_price_group_prices"("price_group_id", "active");

CREATE TABLE IF NOT EXISTS "tenant_template"."product_price_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "uom_id" UUID,
  "price_group_id" UUID,
  "old_selling_price" NUMERIC(14,2),
  "new_selling_price" NUMERIC(14,2),
  "old_cost_price" NUMERIC(14,4),
  "new_cost_price" NUMERIC(14,4),
  "change_reason" TEXT,
  "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
  "actor_user_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_price_history_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_price_history_uom_id_fkey"
    FOREIGN KEY ("uom_id") REFERENCES "tenant_template"."uoms"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "product_price_history_group_id_fkey"
    FOREIGN KEY ("price_group_id") REFERENCES "tenant_template"."price_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_product_price_history_product_created"
  ON "tenant_template"."product_price_history"("product_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_product_price_history_group_created"
  ON "tenant_template"."product_price_history"("price_group_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "tenant_template"."offer_lists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "no" VARCHAR(50) NOT NULL,
  "description" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'disabled',
  "price_group_id" UUID,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "validation_period_id" VARCHAR(100),
  "start_date" DATE,
  "end_date" DATE,
  "offer_type" VARCHAR(50) NOT NULL,
  "discount_type" VARCHAR(50) NOT NULL,
  "discount_value" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "apply_to" VARCHAR(50) NOT NULL DEFAULT 'product',
  "branch_scope" VARCHAR(50) NOT NULL DEFAULT 'all',
  "stacking_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_lists_price_group_id_fkey"
    FOREIGN KEY ("price_group_id") REFERENCES "tenant_template"."price_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "offer_lists_status_check"
    CHECK ("status" IN ('enabled', 'disabled')),
  CONSTRAINT "offer_lists_discount_nonnegative"
    CHECK ("discount_value" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "offer_lists_no_key"
  ON "tenant_template"."offer_lists"("no");
CREATE INDEX IF NOT EXISTS "idx_offer_lists_status_dates_priority"
  ON "tenant_template"."offer_lists"("status", "start_date", "end_date", "priority");
CREATE INDEX IF NOT EXISTS "idx_offer_lists_group_status"
  ON "tenant_template"."offer_lists"("price_group_id", "status");

CREATE TABLE IF NOT EXISTS "tenant_template"."offer_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offer_id" UUID NOT NULL,
  "product_id" UUID,
  "category_id" UUID,
  "min_quantity" NUMERIC(14,4),
  "buy_quantity" NUMERIC(14,4),
  "get_quantity" NUMERIC(14,4),
  "special_price" NUMERIC(14,2),
  "bundle_product_ids" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_rules_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "tenant_template"."offer_lists"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "offer_rules_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "offer_rules_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "tenant_template"."product_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_offer_rules_offer_id"
  ON "tenant_template"."offer_rules"("offer_id");
CREATE INDEX IF NOT EXISTS "idx_offer_rules_product_id"
  ON "tenant_template"."offer_rules"("product_id");
CREATE INDEX IF NOT EXISTS "idx_offer_rules_category_id"
  ON "tenant_template"."offer_rules"("category_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."offer_redemptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offer_id" UUID NOT NULL,
  "sale_id" UUID,
  "sale_item_id" UUID,
  "branch_id" UUID,
  "product_id" UUID,
  "price_group_id" UUID,
  "discount_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_redemptions_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "tenant_template"."offer_lists"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "offer_redemptions_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."sales"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "offer_redemptions_sale_item_id_fkey"
    FOREIGN KEY ("sale_item_id") REFERENCES "tenant_template"."sale_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "offer_redemptions_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "offer_redemptions_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "offer_redemptions_price_group_id_fkey"
    FOREIGN KEY ("price_group_id") REFERENCES "tenant_template"."price_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_offer_redemptions_offer_created"
  ON "tenant_template"."offer_redemptions"("offer_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_offer_redemptions_sale_id"
  ON "tenant_template"."offer_redemptions"("sale_id");

ALTER TABLE "tenant_template"."sale_items"
  ADD COLUMN IF NOT EXISTS "price_group_id" UUID,
  ADD COLUMN IF NOT EXISTS "offer_id" UUID,
  ADD COLUMN IF NOT EXISTS "line_discount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_source" VARCHAR(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_items_price_group_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."sale_items"
      ADD CONSTRAINT "sale_items_price_group_id_fkey"
      FOREIGN KEY ("price_group_id") REFERENCES "tenant_template"."price_groups"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_items_offer_id_fkey'
      AND connamespace = 'tenant_template'::regnamespace
  ) THEN
    ALTER TABLE "tenant_template"."sale_items"
      ADD CONSTRAINT "sale_items_offer_id_fkey"
      FOREIGN KEY ("offer_id") REFERENCES "tenant_template"."offer_lists"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_sale_items_price_group_id"
  ON "tenant_template"."sale_items"("price_group_id");
CREATE INDEX IF NOT EXISTS "idx_sale_items_offer_id"
  ON "tenant_template"."sale_items"("offer_id");

INSERT INTO "tenant_template"."price_groups" ("code", "name", "is_default", "active")
VALUES
  ('RETAIL', 'Retail', TRUE, TRUE),
  ('WHOLESALE', 'Wholesale', FALSE, TRUE),
  ('VIP', 'VIP', FALSE, TRUE),
  ('HOSPITAL', 'Hospital', FALSE, TRUE),
  ('INSURANCE', 'Insurance', FALSE, TRUE)
ON CONFLICT ("code") DO UPDATE
  SET "name" = EXCLUDED."name",
      "active" = TRUE,
      "is_default" = CASE
        WHEN EXCLUDED."code" = 'RETAIL' THEN TRUE
        ELSE price_groups."is_default"
      END,
      "updated_at" = CURRENT_TIMESTAMP;

WITH retail AS (
  SELECT id FROM "tenant_template"."price_groups" WHERE code = 'RETAIL' LIMIT 1
),
active_prices AS (
  SELECT DISTINCT ON (pu.product_id, pu.uom_id)
    pu.product_id,
    pu.uom_id,
    COALESCE(pp.selling_price, CASE
      WHEN pu.is_base THEN p.list_price
      ELSE p.list_price * pu.conversion_factor_to_base
    END) AS selling_price
  FROM "tenant_template"."product_uoms" pu
  JOIN "tenant_template"."products" p ON p.id = pu.product_id
  LEFT JOIN "tenant_template"."product_uom_prices" pp
    ON pp.product_id = pu.product_id
   AND pp.uom_id = pu.uom_id
   AND pp.active IS TRUE
  WHERE pu.is_active IS TRUE
)
INSERT INTO "tenant_template"."product_price_group_prices" (
  "product_id", "uom_id", "price_group_id", "selling_price", "active"
)
SELECT product_id, uom_id, retail.id, GREATEST(COALESCE(selling_price, 0), 0), TRUE
FROM active_prices
CROSS JOIN retail
WHERE selling_price IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "tenant_template"."permissions" ("name")
VALUES ('manage_pricing'),
       ('manage_price_groups'),
       ('manage_offers')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "tenant_template"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "tenant_template"."roles" r
JOIN "tenant_template"."permissions" p
  ON p."name" IN ('manage_pricing', 'manage_price_groups', 'manage_offers')
WHERE r."name" IN ('admin', 'manager')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
