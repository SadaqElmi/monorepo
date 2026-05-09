-- POS shift sessions, cashier statements, link sales to sessions

CREATE TABLE IF NOT EXISTS "tenant_template"."pos_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "device_id" UUID,
    "staff_user_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(6),
    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "tenant_template"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_pos_sessions_branch_status"
  ON "tenant_template"."pos_sessions"("branch_id", "status");
CREATE INDEX IF NOT EXISTS "idx_pos_sessions_branch_opened"
  ON "tenant_template"."pos_sessions"("branch_id", "opened_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_sessions_one_open_per_branch"
  ON "tenant_template"."pos_sessions"("branch_id")
  WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "tenant_template"."pos_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "journal_entry_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(6),
    CONSTRAINT "pos_statements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_statements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tenant_template"."pos_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_statements_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "tenant_template"."journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_pos_statements_session"
  ON "tenant_template"."pos_statements"("session_id");

CREATE UNIQUE INDEX IF NOT EXISTS "pos_statements_one_open_per_session"
  ON "tenant_template"."pos_statements"("session_id")
  WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "tenant_template"."pos_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "payment_bucket" VARCHAR(32) NOT NULL,
    "expected_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT "pos_statement_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "tenant_template"."pos_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pos_statement_lines_statement_bucket_unique" UNIQUE ("statement_id", "payment_bucket")
);

-- Physical table is "Sale" (see 20260308120631_data); not lowercase "sales".
ALTER TABLE "tenant_template"."Sale" ADD COLUMN IF NOT EXISTS "pos_session_id" UUID;

-- Drop legacy FK name only on this table (never use pg_constraint by name alone — names can repeat on other tables).
ALTER TABLE "tenant_template"."Sale" DROP CONSTRAINT IF EXISTS "sales_pos_session_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'tenant_template'
      AND rel.relname = 'Sale'
      AND c.conname = 'Sale_pos_session_id_fkey'
      AND c.contype = 'f'
  ) THEN
    ALTER TABLE "tenant_template"."Sale"
      ADD CONSTRAINT "Sale_pos_session_id_fkey"
      FOREIGN KEY ("pos_session_id") REFERENCES "tenant_template"."pos_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_sales_pos_session_id"
  ON "tenant_template"."Sale"("pos_session_id");
