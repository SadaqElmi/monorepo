-- Performance indexes (public + tenant_template). Live tenant schemas get mirrored SQL in TenantService.applyTenantSchemaPatches.

-- Domain table name varies by migration history: init used public.domains; 20260308120631_data uses "Domain".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'domains'
  ) THEN
    CREATE INDEX IF NOT EXISTS "domains_tenant_id_idx" ON "public"."domains"("tenant_id");
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Domain'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Domain_tenant_id_idx" ON "public"."Domain"("tenant_id");
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_branch_id_idx" ON "tenant_template"."User"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PatientLoan_branch_id_idx" ON "tenant_template"."PatientLoan"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PatientLoan_customer_id_idx" ON "tenant_template"."PatientLoan"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PatientLoanPayment_loan_id_idx" ON "tenant_template"."PatientLoanPayment"("loan_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Purchase_branch_id_idx" ON "tenant_template"."Purchase"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Purchase_supplier_id_idx" ON "tenant_template"."Purchase"("supplier_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Purchase_invoice_number_idx" ON "tenant_template"."Purchase"("invoice_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Purchase_branch_id_created_at_idx" ON "tenant_template"."Purchase"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseItem_purchase_id_idx" ON "tenant_template"."PurchaseItem"("purchase_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseItem_product_id_idx" ON "tenant_template"."PurchaseItem"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseItem_branch_id_idx" ON "tenant_template"."PurchaseItem"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SaleItem_sale_id_idx" ON "tenant_template"."SaleItem"("sale_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SaleItem_product_id_idx" ON "tenant_template"."SaleItem"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SaleItem_branch_id_idx" ON "tenant_template"."SaleItem"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_sale_id_idx" ON "tenant_template"."Payment"("sale_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expense_branch_id_idx" ON "tenant_template"."Expense"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expense_created_at_idx" ON "tenant_template"."Expense"("created_at" DESC);
