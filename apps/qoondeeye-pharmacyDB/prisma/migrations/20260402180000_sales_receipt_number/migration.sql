-- Per-branch receipt numbers for POS (aligns Prisma Sale.receiptNumber with DB).

ALTER TABLE "tenant_template"."Sale" ADD COLUMN "receipt_number" VARCHAR(20);

CREATE UNIQUE INDEX "sales_branch_receipt_unique" ON "tenant_template"."Sale"("branch_id", "receipt_number");

CREATE INDEX "sales_branch_id_receipt_number_idx" ON "tenant_template"."Sale"("branch_id", "receipt_number");
