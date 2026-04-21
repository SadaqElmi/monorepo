-- Phase 2A: tenant-level multi-entity hierarchy (100% ownership)

CREATE TABLE IF NOT EXISTS "tenant_template"."entities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "code" VARCHAR(64) NOT NULL UNIQUE,
  "parent_entity_id" UUID REFERENCES "tenant_template"."entities"("id") ON DELETE SET NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_entities_parent"
  ON "tenant_template"."entities"("parent_entity_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."entity_branches" (
  "entity_id" UUID NOT NULL REFERENCES "tenant_template"."entities"("id") ON DELETE CASCADE,
  "branch_id" UUID NOT NULL REFERENCES "tenant_template"."branches"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("entity_id", "branch_id")
);

CREATE INDEX IF NOT EXISTS "idx_entity_branches_branch"
  ON "tenant_template"."entity_branches"("branch_id");

CREATE TABLE IF NOT EXISTS "tenant_template"."entity_ownership" (
  "parent_entity_id" UUID NOT NULL REFERENCES "tenant_template"."entities"("id") ON DELETE CASCADE,
  "child_entity_id" UUID NOT NULL REFERENCES "tenant_template"."entities"("id") ON DELETE CASCADE,
  "ownership_percent" NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("parent_entity_id", "child_entity_id"),
  CONSTRAINT "entity_ownership_no_self" CHECK ("parent_entity_id" <> "child_entity_id"),
  CONSTRAINT "entity_ownership_100_only" CHECK ("ownership_percent" = 100.00)
);

CREATE INDEX IF NOT EXISTS "idx_entity_ownership_parent"
  ON "tenant_template"."entity_ownership"("parent_entity_id");

CREATE INDEX IF NOT EXISTS "idx_entity_ownership_child"
  ON "tenant_template"."entity_ownership"("child_entity_id");

ALTER TABLE "tenant_template"."consolidation_runs"
  ADD COLUMN IF NOT EXISTS "entity_id" UUID REFERENCES "tenant_template"."entities"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_consolidation_runs_entity_period"
  ON "tenant_template"."consolidation_runs"("entity_id", "period_key", "created_at" DESC);
