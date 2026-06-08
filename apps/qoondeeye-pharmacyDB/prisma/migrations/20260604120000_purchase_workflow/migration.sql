-- Purchase workflow: status, BC-style header fields, line receive tracking (tenant_template)

ALTER TABLE "tenant_template"."purchases"
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS purchase_order_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supplier_invoice_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS posting_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP;

UPDATE "tenant_template"."purchases"
SET supplier_invoice_no = invoice_number
WHERE supplier_invoice_no IS NULL AND invoice_number IS NOT NULL;

UPDATE "tenant_template"."purchases"
SET status = 'closed'
WHERE status IS NULL OR status = '';

ALTER TABLE "tenant_template"."purchase_items"
  ADD COLUMN IF NOT EXISTS quantity_received INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_discount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_notes TEXT,
  ADD COLUMN IF NOT EXISTS planned_batch_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS planned_expiry_date DATE;

UPDATE "tenant_template"."purchase_items"
SET quantity_received = COALESCE(quantity, 0)
WHERE quantity_received = 0 AND batch_id IS NOT NULL;

ALTER TABLE "tenant_template"."tenant_settings"
  ADD COLUMN IF NOT EXISTS invoice_before_receive BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_purchases_status ON "tenant_template"."purchases"(status);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_order_no ON "tenant_template"."purchases"(purchase_order_no);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_invoice_no ON "tenant_template"."purchases"(supplier_invoice_no);
