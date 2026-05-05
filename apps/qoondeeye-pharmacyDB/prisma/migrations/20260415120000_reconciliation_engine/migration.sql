-- Reconciliation engine: public audit tables (SaaS core)

CREATE TABLE IF NOT EXISTS "public"."reconciliation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(6),
    "status" VARCHAR(20) NOT NULL,
    "summary" JSONB,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."reconciliation_logs" (
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

CREATE INDEX IF NOT EXISTS "reconciliation_runs_tenant_id_started_at_idx"
  ON "public"."reconciliation_runs"("tenant_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "reconciliation_logs_tenant_id_created_at_idx"
  ON "public"."reconciliation_logs"("tenant_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "reconciliation_logs_run_id_idx"
  ON "public"."reconciliation_logs"("run_id");

CREATE INDEX IF NOT EXISTS "reconciliation_logs_tenant_id_severity_idx"
  ON "public"."reconciliation_logs"("tenant_id", "severity");

CREATE INDEX IF NOT EXISTS "reconciliation_logs_tenant_id_type_idx"
  ON "public"."reconciliation_logs"("tenant_id", "type");

ALTER TABLE "public"."reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."reconciliation_logs"
  ADD CONSTRAINT "reconciliation_logs_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."reconciliation_logs"
  ADD CONSTRAINT "reconciliation_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
