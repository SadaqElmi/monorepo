-- Cost snapshots on sale line items (used by sales posting and transaction register COGS).
ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "unit_cost_snapshot" DECIMAL(14, 4);

ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "line_cost_snapshot" DECIMAL(14, 2);
