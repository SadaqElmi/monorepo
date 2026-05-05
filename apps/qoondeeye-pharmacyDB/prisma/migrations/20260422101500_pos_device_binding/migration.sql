-- Device-bound POS login foundation.

-- Some databases lack baseline public SaaS tables (init never applied). FK requires Tenant (PascalCase; see 20260308120631_data).
CREATE TABLE IF NOT EXISTS "public"."Tenant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "schema_name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_schema_name_key"
  ON "public"."Tenant"("schema_name");

CREATE TABLE IF NOT EXISTS "public"."pos_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "device_code" VARCHAR(128) NOT NULL,
  "display_name" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "device_secret_hash" VARCHAR(128) NOT NULL,
  "branch_id" UUID,
  "bound_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(6),
  "revoked_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_devices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "public"."Tenant"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_devices_device_code_key"
  ON "public"."pos_devices"("device_code");

CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_status_idx"
  ON "public"."pos_devices"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_device_code_idx"
  ON "public"."pos_devices"("tenant_id", "device_code");
