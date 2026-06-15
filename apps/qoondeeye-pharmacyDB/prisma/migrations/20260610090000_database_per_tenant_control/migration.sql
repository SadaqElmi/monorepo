-- Control DB metadata for database-per-tenant rollout.
-- Existing schema-per-tenant rows keep working; database-mode rows store encrypted runtime URLs.

ALTER TABLE "public"."Tenant"
  ADD COLUMN IF NOT EXISTS "slug" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "subdomain" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "custom_domain" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "database_name" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "database_url_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "provisioning_status" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "provisioning_lock_id" UUID,
  ADD COLUMN IF NOT EXISTS "provisioning_started_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "plan_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "owner_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "scheduled_delete_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "public"."Tenant"
SET
  "slug" = COALESCE("slug", "schema_name"),
  "subdomain" = COALESCE("subdomain", "schema_name"),
  "provisioning_status" = COALESCE("provisioning_status", 'active')
WHERE "schema_name" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key"
  ON "public"."Tenant"("slug")
  WHERE "slug" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_subdomain_key"
  ON "public"."Tenant"("subdomain")
  WHERE "subdomain" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_custom_domain_key"
  ON "public"."Tenant"("custom_domain")
  WHERE "custom_domain" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_database_name_key"
  ON "public"."Tenant"("database_name")
  WHERE "database_name" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Tenant_status_idx"
  ON "public"."Tenant"("status");

CREATE INDEX IF NOT EXISTS "Tenant_provisioning_status_idx"
  ON "public"."Tenant"("provisioning_status");

CREATE TABLE IF NOT EXISTS "public"."tenant_migration_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "migration_name" VARCHAR(255) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(6),
  "error_message" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_migration_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tenant_migration_runs_tenant_started_idx"
  ON "public"."tenant_migration_runs"("tenant_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "tenant_migration_runs_tenant_migration_idx"
  ON "public"."tenant_migration_runs"("tenant_id", "migration_name");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_migration_runs_tenant_id_fkey'
  ) THEN
    ALTER TABLE "public"."tenant_migration_runs"
      ADD CONSTRAINT "tenant_migration_runs_tenant_id_fkey"
      FOREIGN KEY ("tenant_id")
      REFERENCES "public"."Tenant"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
