-- pos_devices migration historically created / referenced lowercase "tenants" while canonical SaaS table is "Tenant".
-- Repoint FK and drop the stray duplicate table when it is empty.

ALTER TABLE "public"."pos_devices"
  DROP CONSTRAINT IF EXISTS "pos_devices_tenant_id_fkey";

DROP TABLE IF EXISTS "public"."tenants";

ALTER TABLE "public"."pos_devices"
  ADD CONSTRAINT "pos_devices_tenant_id_fkey"
  FOREIGN KEY ("tenant_id")
  REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
