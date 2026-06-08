CREATE TABLE IF NOT EXISTS "public"."system_health_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "snapshot_hour" TIMESTAMP(6) NOT NULL,
  "check_key" VARCHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "summary" JSONB NOT NULL,
  "source_run_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_health_snapshots_unique" UNIQUE ("tenant_id", "snapshot_hour", "check_key")
);

CREATE INDEX IF NOT EXISTS "idx_health_snapshots_tenant_hour"
  ON "public"."system_health_snapshots"("tenant_id", "snapshot_hour" DESC);

CREATE INDEX IF NOT EXISTS "idx_health_snapshots_check_hour"
  ON "public"."system_health_snapshots"("check_key", "snapshot_hour" DESC);

CREATE INDEX IF NOT EXISTS "idx_health_snapshots_status_hour"
  ON "public"."system_health_snapshots"("status", "snapshot_hour" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'system_health_snapshots_tenant_id_fkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE "public"."system_health_snapshots"
      ADD CONSTRAINT "system_health_snapshots_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
