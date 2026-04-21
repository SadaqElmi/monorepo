-- Sales are identified by per-branch receipt_number; customer link removed from sales.

ALTER TABLE "tenant_template"."Sale" DROP COLUMN IF EXISTS "customer_id";
