CREATE TABLE IF NOT EXISTS "public"."pos_control_audit_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "public"."Tenant"("id") ON DELETE CASCADE,
  "device_id" UUID REFERENCES "public"."pos_devices"("id") ON DELETE SET NULL,
  "action" VARCHAR(64) NOT NULL,
  "actor_user_id" UUID,
  "actor_type" VARCHAR(20) NOT NULL DEFAULT 'erp_user',
  "ip_address" INET,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "pos_control_audit_device_created"
  ON "public"."pos_control_audit_events" ("device_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "pos_control_audit_tenant_created"
  ON "public"."pos_control_audit_events" ("tenant_id", "created_at" DESC);
