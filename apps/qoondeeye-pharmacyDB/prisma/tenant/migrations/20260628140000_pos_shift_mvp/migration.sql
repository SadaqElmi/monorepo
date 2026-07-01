-- POS Shift MVP: one open shift per cashier, Z-report close metadata

ALTER TABLE "pos_sessions"
  ADD COLUMN IF NOT EXISTS "z_report_printed_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "closing_totals" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "pos_sessions_one_open_per_staff"
  ON "pos_sessions" ("staff_user_id")
  WHERE "status" IN ('open', 'paused') AND "staff_user_id" IS NOT NULL;
