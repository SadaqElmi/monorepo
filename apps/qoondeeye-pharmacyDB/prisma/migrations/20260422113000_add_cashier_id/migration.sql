-- Add dedicated cashier login identifier.

CREATE SCHEMA IF NOT EXISTS "tenant_template";

-- Baseline (20250308000000_init) may be missing on this database; required before ALTER.
CREATE TABLE IF NOT EXISTS "tenant_template"."users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(200),
  "email" VARCHAR(200),
  "password" TEXT,
  "role" VARCHAR(50),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"
  ON "tenant_template"."users"("email");

ALTER TABLE "tenant_template"."users"
  ADD COLUMN IF NOT EXISTS "cashier_id" VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS "users_cashier_id_unique_not_null"
  ON "tenant_template"."users"("cashier_id")
  WHERE "cashier_id" IS NOT NULL AND BTRIM("cashier_id") <> '';
