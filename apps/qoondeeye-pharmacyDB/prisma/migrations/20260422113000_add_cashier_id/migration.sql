-- Add dedicated cashier login identifier.
ALTER TABLE "tenant_template"."users"
  ADD COLUMN IF NOT EXISTS "cashier_id" VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS "users_cashier_id_unique_not_null"
  ON "tenant_template"."users"("cashier_id")
  WHERE "cashier_id" IS NOT NULL AND BTRIM("cashier_id") <> '';
