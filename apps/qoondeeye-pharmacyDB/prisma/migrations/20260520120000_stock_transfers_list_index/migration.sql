-- Composite index for transfer list filters (branch + status).
-- stock_transfers lives in per-tenant schemas; tenant_template may not have the table yet.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'tenant_template' AND table_name = 'stock_transfers'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to_status
      ON "tenant_template"."stock_transfers"(from_branch_id, to_branch_id, status);
    CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_status
      ON "tenant_template"."stock_transfers"(to_branch_id, status);
  END IF;
END $$;
