-- Offline POS sync: client sale reference and sync source on sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS client_sale_ref UUID,
  ADD COLUMN IF NOT EXISTS sync_source VARCHAR(16) DEFAULT 'online';

CREATE UNIQUE INDEX IF NOT EXISTS sales_branch_client_sale_ref_unique
  ON sales (branch_id, client_sale_ref)
  WHERE client_sale_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_sync_source_idx ON sales (sync_source);
