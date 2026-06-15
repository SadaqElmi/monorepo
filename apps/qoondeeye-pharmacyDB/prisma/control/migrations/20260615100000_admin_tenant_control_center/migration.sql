-- Safe Admin Tenant Control Center metadata.
-- Control DB only: no tenant business tables are copied or exposed here.

ALTER TABLE "public"."Tenant"
  ADD COLUMN IF NOT EXISTS "owner_name" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "owner_email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "database_health_status" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "migration_status" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "storage_used_bytes" BIGINT,
  ADD COLUMN IF NOT EXISTS "last_backup_at" TIMESTAMPTZ;

ALTER TABLE "public"."Tenant"
  ALTER COLUMN "status" SET DEFAULT 'pending_setup';

UPDATE "public"."Tenant"
SET "status" = 'pending_setup'
WHERE "status" = 'provisioning';

UPDATE "public"."Tenant"
SET "status" = 'inactive'
WHERE "status" = 'deleted';

UPDATE "public"."Tenant"
SET
  "status" = 'inactive',
  "database_health_status" = COALESCE("database_health_status", 'not_configured'),
  "error_message" = COALESCE("error_message", 'Missing encrypted tenant database URL')
WHERE "status" = 'active'
  AND ("database_url_encrypted" IS NULL OR btrim("database_url_encrypted") = '');

CREATE INDEX IF NOT EXISTS "Tenant_database_health_status_idx"
  ON "public"."Tenant"("database_health_status");

CREATE INDEX IF NOT EXISTS "Tenant_migration_status_idx"
  ON "public"."Tenant"("migration_status");

CREATE INDEX IF NOT EXISTS "Tenant_last_login_at_idx"
  ON "public"."Tenant"("last_login_at" DESC);

CREATE TABLE IF NOT EXISTS "public"."admin_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "admin_user_id" UUID,
  "action" VARCHAR(80) NOT NULL,
  "tenant_id" UUID,
  "result" VARCHAR(16) NOT NULL,
  "error_message" TEXT,
  "ip_address" INET,
  "user_agent" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_audit_events_tenant_created_idx"
  ON "public"."admin_audit_events"("tenant_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "admin_audit_events_admin_created_idx"
  ON "public"."admin_audit_events"("admin_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "admin_audit_events_action_created_idx"
  ON "public"."admin_audit_events"("action", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_audit_events_tenant_id_fkey'
  ) THEN
    ALTER TABLE "public"."admin_audit_events"
      ADD CONSTRAINT "admin_audit_events_tenant_id_fkey"
      FOREIGN KEY ("tenant_id")
      REFERENCES "public"."Tenant"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."tenant_backup_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'accepted',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "error_message" TEXT,
  "metadata" JSONB,
  CONSTRAINT "tenant_backup_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tenant_backup_jobs_tenant_requested_idx"
  ON "public"."tenant_backup_jobs"("tenant_id", "requested_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_backup_jobs_tenant_id_fkey'
  ) THEN
    ALTER TABLE "public"."tenant_backup_jobs"
      ADD CONSTRAINT "tenant_backup_jobs_tenant_id_fkey"
      FOREIGN KEY ("tenant_id")
      REFERENCES "public"."Tenant"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
