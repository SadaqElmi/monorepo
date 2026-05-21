-- From 20260520120000: live tenants use snake_case tables (e.g. wakiil.stock_transfers)
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to_status
  ON "wakiil"."stock_transfers"(from_branch_id, to_branch_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_status
  ON "wakiil"."stock_transfers"(to_branch_id, status);
