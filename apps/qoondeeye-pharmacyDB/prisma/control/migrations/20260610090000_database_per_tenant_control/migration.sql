-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "schema_name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100),
    "subdomain" VARCHAR(100),
    "custom_domain" VARCHAR(255),
    "database_name" VARCHAR(128),
    "database_url_encrypted" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "provisioning_status" VARCHAR(40),
    "provisioning_lock_id" UUID,
    "provisioning_started_at" TIMESTAMP(6),
    "plan_id" VARCHAR(100),
    "owner_user_id" UUID,
    "error_message" TEXT,
    "deleted_at" TIMESTAMP(6),
    "scheduled_delete_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_migration_runs" (
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

-- CreateTable
CREATE TABLE "pos_devices" (
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
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password" TEXT NOT NULL,
    "name" VARCHAR(200),
    "role" VARCHAR(50) NOT NULL DEFAULT 'super_admin',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(6),
    "status" VARCHAR(20) NOT NULL,
    "summary" JSONB,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "entity_id" VARCHAR(64),
    "severity" VARCHAR(16) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "snapshot_hour" TIMESTAMP(6) NOT NULL,
    "check_key" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "summary" JSONB NOT NULL,
    "source_run_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_schema_name_key" ON "Tenant"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_custom_domain_key" ON "Tenant"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_database_name_key" ON "Tenant"("database_name");

-- CreateIndex
CREATE INDEX "tenant_migration_runs_tenant_id_started_at_idx" ON "tenant_migration_runs"("tenant_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "tenant_migration_runs_tenant_id_migration_name_idx" ON "tenant_migration_runs"("tenant_id", "migration_name");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_device_code_key" ON "pos_devices"("device_code");

-- CreateIndex
CREATE INDEX "pos_devices_tenant_id_status_idx" ON "pos_devices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "pos_devices_tenant_id_device_code_idx" ON "pos_devices"("tenant_id", "device_code");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE INDEX "Domain_tenant_id_idx" ON "Domain"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "reconciliation_runs_tenant_id_started_at_idx" ON "reconciliation_runs"("tenant_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "reconciliation_logs_tenant_id_created_at_idx" ON "reconciliation_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reconciliation_logs_run_id_idx" ON "reconciliation_logs"("run_id");

-- CreateIndex
CREATE INDEX "reconciliation_logs_tenant_id_severity_idx" ON "reconciliation_logs"("tenant_id", "severity");

-- CreateIndex
CREATE INDEX "reconciliation_logs_tenant_id_type_idx" ON "reconciliation_logs"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "idx_health_snapshots_tenant_hour" ON "system_health_snapshots"("tenant_id", "snapshot_hour" DESC);

-- CreateIndex
CREATE INDEX "idx_health_snapshots_check_hour" ON "system_health_snapshots"("check_key", "snapshot_hour" DESC);

-- CreateIndex
CREATE INDEX "idx_health_snapshots_status_hour" ON "system_health_snapshots"("status", "snapshot_hour" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "system_health_snapshots_unique" ON "system_health_snapshots"("tenant_id", "snapshot_hour", "check_key");

-- AddForeignKey
ALTER TABLE "tenant_migration_runs" ADD CONSTRAINT "tenant_migration_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_logs" ADD CONSTRAINT "reconciliation_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_logs" ADD CONSTRAINT "reconciliation_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_health_snapshots" ADD CONSTRAINT "system_health_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
