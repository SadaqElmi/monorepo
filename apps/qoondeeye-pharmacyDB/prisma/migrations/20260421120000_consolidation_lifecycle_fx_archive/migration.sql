-- Consolidation lifecycle: finalized timestamps, stricter uniqueness, draft support, audit archive table.

ALTER TABLE "tenant_template"."consolidation_runs"
  ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "finalized_by" UUID;

DROP INDEX IF EXISTS "tenant_template"."uq_consolidation_runs_active_scope_period";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_consolidation_runs_posted_final_scope_period"
  ON "tenant_template"."consolidation_runs"("period_key", "scope_hash")
  WHERE "reversed_at" IS NULL AND "status" IN ('posted', 'finalized');

CREATE UNIQUE INDEX IF NOT EXISTS "uq_consolidation_runs_draft_scope_period"
  ON "tenant_template"."consolidation_runs"("period_key", "scope_hash")
  WHERE "reversed_at" IS NULL AND "status" = 'draft';

CREATE TABLE IF NOT EXISTS "tenant_template"."audit_log_archive" (
  "id" UUID NOT NULL,
  "archived_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "row_data" JSONB NOT NULL,
  CONSTRAINT "audit_log_archive_pkey" PRIMARY KEY ("id", "archived_at")
);

CREATE INDEX IF NOT EXISTS "idx_audit_log_archive_archived_at"
  ON "tenant_template"."audit_log_archive"("archived_at" DESC);
