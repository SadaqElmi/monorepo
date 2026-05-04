-- Consolidation engine phase 1 (single-tenant, multi-branch)
-- Tenant template tables for posted consolidation runs and journal links.

CREATE SCHEMA IF NOT EXISTS "tenant_template";

-- Minimal bootstrap (same as 20250308000000_init): accounting FKs reference branches.
CREATE TABLE IF NOT EXISTS "tenant_template"."branches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255),
  "phone" VARCHAR(50),
  "address" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- Accounting tables were historically created only via runtime tenant DDL (TenantService.ensureAccountingSchema),
-- not in older migrations. consolidation_journal_links FK-references journal_entries — ensure template equivalents exist.
CREATE TABLE IF NOT EXISTS "tenant_template"."chart_of_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL REFERENCES "tenant_template"."branches"("id") ON DELETE CASCADE,
  "code" VARCHAR(32),
  "name" VARCHAR(255) NOT NULL,
  "account_type" VARCHAR(20) NOT NULL,
  "account_key" VARCHAR(50) NOT NULL,
  "is_system" BOOLEAN DEFAULT TRUE,
  "payment_method_key" VARCHAR(50),
  "parent_id" UUID REFERENCES "tenant_template"."chart_of_accounts"("id"),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("branch_id", "account_key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chart_of_accounts_branch_payment_key_uq"
  ON "tenant_template"."chart_of_accounts"("branch_id", "payment_method_key")
  WHERE "payment_method_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tenant_template"."journal_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL REFERENCES "tenant_template"."branches"("id"),
  "entry_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "description" TEXT,
  "source_type" VARCHAR(32) NOT NULL,
  "source_id" UUID,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_source_uq"
  ON "tenant_template"."journal_entries"("branch_id", "source_type", "source_id")
  WHERE "source_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "journal_entries_branch_date_idx"
  ON "tenant_template"."journal_entries"("branch_id", "entry_date");

CREATE TABLE IF NOT EXISTS "tenant_template"."journal_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "journal_entry_id" UUID NOT NULL REFERENCES "tenant_template"."journal_entries"("id") ON DELETE CASCADE,
  "account_id" UUID NOT NULL REFERENCES "tenant_template"."chart_of_accounts"("id"),
  "debit" NUMERIC(14,2) DEFAULT 0 NOT NULL,
  "credit" NUMERIC(14,2) DEFAULT 0 NOT NULL,
  CONSTRAINT "journal_lines_one_side_positive" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  )
);

CREATE INDEX IF NOT EXISTS "journal_lines_entry_idx"
  ON "tenant_template"."journal_lines"("journal_entry_id");

CREATE INDEX IF NOT EXISTS "journal_lines_account_idx"
  ON "tenant_template"."journal_lines"("account_id");

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
