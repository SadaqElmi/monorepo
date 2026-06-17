ALTER TABLE "pos_sessions"
  ADD COLUMN IF NOT EXISTS "opening_cash" NUMERIC(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "closing_cash" NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reopened_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "variance_approved_by" UUID,
  ADD COLUMN IF NOT EXISTS "variance_approved_at" TIMESTAMPTZ;

DROP INDEX IF EXISTS "pos_sessions_one_open_per_branch";

CREATE UNIQUE INDEX IF NOT EXISTS "pos_sessions_one_open_per_device"
  ON "pos_sessions" ("device_id")
  WHERE "status" IN ('open', 'paused') AND "device_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "pos_sessions_device_opened"
  ON "pos_sessions" ("device_id", "opened_at" DESC)
  WHERE "device_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "audit_logs_pos_auth_device"
  ON "audit_logs" ("entity_id", "created_at" DESC)
  WHERE "table_name" = 'pos_auth';
