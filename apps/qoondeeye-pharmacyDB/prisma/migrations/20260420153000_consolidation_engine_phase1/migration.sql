-- Consolidation engine phase 1 (single-tenant, multi-branch)
-- Tenant template tables for posted consolidation runs and journal links.

CREATE TABLE IF NOT EXISTS "tenant_template"."consolidation_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "period_key" VARCHAR(32) NOT NULL,
  "as_of_date" DATE NOT NULL,
  "from_date" DATE NOT NULL,
  "to_date" DATE NOT NULL,
  "scope_hash" VARCHAR(64) NOT NULL,
  "scope_branch_ids" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'posted',
  "created_by" UUID,
  "reversed_by" UUID,
  "posted_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversed_at" TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_consolidation_runs_period_created"
  ON "tenant_template"."consolidation_runs"("period_key", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_consolidation_runs_scope_created"
  ON "tenant_template"."consolidation_runs"("scope_hash", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_consolidation_runs_active_scope_period"
  ON "tenant_template"."consolidation_runs"("period_key", "scope_hash")
  WHERE "reversed_at" IS NULL;

CREATE TABLE IF NOT EXISTS "tenant_template"."consolidation_journal_links" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL REFERENCES "tenant_template"."consolidation_runs"("id") ON DELETE CASCADE,
  "journal_entry_id" UUID NOT NULL REFERENCES "tenant_template"."journal_entries"("id") ON DELETE CASCADE,
  "elimination_type" VARCHAR(24) NOT NULL,
  "account_key" VARCHAR(64),
  "direction" VARCHAR(8),
  "amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "source_refs" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_consolidation_links_run_created"
  ON "tenant_template"."consolidation_journal_links"("run_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_consolidation_links_journal"
  ON "tenant_template"."consolidation_journal_links"("journal_entry_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."consolidation_run_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL REFERENCES "tenant_template"."consolidation_runs"("id") ON DELETE CASCADE,
  "event_type" VARCHAR(32) NOT NULL,
  "actor_user_id" UUID,
  "payload" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_consolidation_events_run_created"
  ON "tenant_template"."consolidation_run_events"("run_id", "created_at" DESC);
