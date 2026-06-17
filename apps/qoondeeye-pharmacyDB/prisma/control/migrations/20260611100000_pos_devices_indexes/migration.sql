-- Additional indexes for POS terminal list filtering and pagination

CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_binding_status_idx"
  ON "public"."pos_devices"("tenant_id", "binding_status");

CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_branch_id_idx"
  ON "public"."pos_devices"("tenant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_created_at_idx"
  ON "public"."pos_devices"("tenant_id", "created_at" DESC);
