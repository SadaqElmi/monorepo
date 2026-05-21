-- Adapted from 20260511120000: legacy dump uses public."Domain" not public.domains
CREATE INDEX IF NOT EXISTS "domains_tenant_id_idx" ON "public"."Domain"("tenant_id");

CREATE INDEX IF NOT EXISTS "User_branch_id_idx" ON "tenant_template"."User"("branch_id");
CREATE INDEX IF NOT EXISTS "PatientLoan_branch_id_idx" ON "tenant_template"."PatientLoan"("branch_id");
CREATE INDEX IF NOT EXISTS "PatientLoan_customer_id_idx" ON "tenant_template"."PatientLoan"("customer_id");
CREATE INDEX IF NOT EXISTS "PatientLoanPayment_loan_id_idx" ON "tenant_template"."PatientLoanPayment"("loan_id");
CREATE INDEX IF NOT EXISTS "Purchase_branch_id_idx" ON "tenant_template"."Purchase"("branch_id");
CREATE INDEX IF NOT EXISTS "Purchase_supplier_id_idx" ON "tenant_template"."Purchase"("supplier_id");
CREATE INDEX IF NOT EXISTS "Purchase_invoice_number_idx" ON "tenant_template"."Purchase"("invoice_number");
CREATE INDEX IF NOT EXISTS "Purchase_branch_id_created_at_idx" ON "tenant_template"."Purchase"("branch_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "PurchaseItem_purchase_id_idx" ON "tenant_template"."PurchaseItem"("purchase_id");
CREATE INDEX IF NOT EXISTS "PurchaseItem_product_id_idx" ON "tenant_template"."PurchaseItem"("product_id");
CREATE INDEX IF NOT EXISTS "PurchaseItem_branch_id_idx" ON "tenant_template"."PurchaseItem"("branch_id");
CREATE INDEX IF NOT EXISTS "SaleItem_sale_id_idx" ON "tenant_template"."SaleItem"("sale_id");
CREATE INDEX IF NOT EXISTS "SaleItem_product_id_idx" ON "tenant_template"."SaleItem"("product_id");
CREATE INDEX IF NOT EXISTS "SaleItem_branch_id_idx" ON "tenant_template"."SaleItem"("branch_id");
CREATE INDEX IF NOT EXISTS "Payment_sale_id_idx" ON "tenant_template"."Payment"("sale_id");
CREATE INDEX IF NOT EXISTS "Expense_branch_id_idx" ON "tenant_template"."Expense"("branch_id");
CREATE INDEX IF NOT EXISTS "Expense_created_at_idx" ON "tenant_template"."Expense"("created_at" DESC);
