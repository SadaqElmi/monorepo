-- Phase 2B: enterprise consolidation primitives

-- Partial ownership support with effective dating.
ALTER TABLE "tenant_template"."entity_ownership"
  DROP CONSTRAINT IF EXISTS "entity_ownership_100_only";

ALTER TABLE "tenant_template"."entity_ownership"
  ADD COLUMN IF NOT EXISTS "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS "effective_to" DATE;

ALTER TABLE "tenant_template"."entity_ownership"
  ADD CONSTRAINT "entity_ownership_percent_range"
  CHECK ("ownership_percent" > 0 AND "ownership_percent" <= 100.00);

ALTER TABLE "tenant_template"."entity_ownership"
  ADD CONSTRAINT "entity_ownership_effective_range"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

CREATE INDEX IF NOT EXISTS "idx_entity_ownership_effective"
  ON "tenant_template"."entity_ownership"("parent_entity_id", "effective_from", "effective_to");

-- Entity reporting currency + FX rate store.
ALTER TABLE "tenant_template"."entities"
  ADD COLUMN IF NOT EXISTS "reporting_currency" VARCHAR(8) NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS "tenant_template"."fx_rates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_currency" VARCHAR(8) NOT NULL,
  "to_currency" VARCHAR(8) NOT NULL,
  "rate_type" VARCHAR(24) NOT NULL DEFAULT 'closing',
  "rate" NUMERIC(18,8) NOT NULL,
  "as_of_date" DATE NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fx_rate_positive" CHECK ("rate" > 0),
  UNIQUE("from_currency", "to_currency", "rate_type", "as_of_date")
);

CREATE INDEX IF NOT EXISTS "idx_fx_rates_lookup"
  ON "tenant_template"."fx_rates"("as_of_date" DESC, "from_currency", "to_currency", "rate_type");

-- Manual consolidation adjustments.
CREATE TABLE IF NOT EXISTS "tenant_template"."consolidation_adjustments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "period_key" VARCHAR(32) NOT NULL,
  "scope_hash" VARCHAR(64) NOT NULL,
  "entity_id" UUID REFERENCES "tenant_template"."entities"("id") ON DELETE SET NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "title" VARCHAR(255) NOT NULL,
  "justification" TEXT,
  "lines" JSONB NOT NULL,
  "approved_by" UUID,
  "approved_at" TIMESTAMP,
  "applied_run_id" UUID REFERENCES "tenant_template"."consolidation_runs"("id") ON DELETE SET NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_consolidation_adjustments_scope"
  ON "tenant_template"."consolidation_adjustments"("period_key", "scope_hash", "status");

CREATE INDEX IF NOT EXISTS "idx_consolidation_adjustments_entity"
  ON "tenant_template"."consolidation_adjustments"("entity_id", "status");
