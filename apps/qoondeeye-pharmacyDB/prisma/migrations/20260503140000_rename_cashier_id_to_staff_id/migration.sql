-- Rename POS login identifier column cashier_id -> staff_id (tenant_template)

ALTER TABLE "tenant_template"."users" RENAME COLUMN "cashier_id" TO "staff_id";

ALTER INDEX IF EXISTS "tenant_template"."users_cashier_id_unique_not_null" RENAME TO "users_staff_id_unique_not_null";
