-- Composite index for transfer list filters (branch + status).
-- Applied per-tenant via tenant bootstrap; this documents the canonical DDL.

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to_status
  ON "tenant_template"."stock_transfers"(from_branch_id, to_branch_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_status
  ON "tenant_template"."stock_transfers"(to_branch_id, status);
