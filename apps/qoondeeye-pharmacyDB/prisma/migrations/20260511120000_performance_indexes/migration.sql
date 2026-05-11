-- Performance indexes (public + tenant_template). Live tenant schemas get mirrored SQL in TenantService.applyTenantSchemaPatches.

-- CreateIndex
CREATE INDEX "domains_tenant_id_idx" ON "public"."domains"("tenant_id");

-- CreateIndex
CREATE INDEX "User_branch_id_idx" ON "tenant_template"."User"("branch_id");

-- CreateIndex
CREATE INDEX "PatientLoan_branch_id_idx" ON "tenant_template"."PatientLoan"("branch_id");

-- CreateIndex
CREATE INDEX "PatientLoan_customer_id_idx" ON "tenant_template"."PatientLoan"("customer_id");

-- CreateIndex
CREATE INDEX "PatientLoanPayment_loan_id_idx" ON "tenant_template"."PatientLoanPayment"("loan_id");

-- CreateIndex
CREATE INDEX "Purchase_branch_id_idx" ON "tenant_template"."Purchase"("branch_id");

-- CreateIndex
CREATE INDEX "Purchase_supplier_id_idx" ON "tenant_template"."Purchase"("supplier_id");

-- CreateIndex
CREATE INDEX "Purchase_invoice_number_idx" ON "tenant_template"."Purchase"("invoice_number");

-- CreateIndex
CREATE INDEX "Purchase_branch_id_created_at_idx" ON "tenant_template"."Purchase"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "PurchaseItem_purchase_id_idx" ON "tenant_template"."PurchaseItem"("purchase_id");

-- CreateIndex
CREATE INDEX "PurchaseItem_product_id_idx" ON "tenant_template"."PurchaseItem"("product_id");

-- CreateIndex
CREATE INDEX "PurchaseItem_branch_id_idx" ON "tenant_template"."PurchaseItem"("branch_id");

-- CreateIndex
CREATE INDEX "SaleItem_sale_id_idx" ON "tenant_template"."SaleItem"("sale_id");

-- CreateIndex
CREATE INDEX "SaleItem_product_id_idx" ON "tenant_template"."SaleItem"("product_id");

-- CreateIndex
CREATE INDEX "SaleItem_branch_id_idx" ON "tenant_template"."SaleItem"("branch_id");

-- CreateIndex
CREATE INDEX "Payment_sale_id_idx" ON "tenant_template"."Payment"("sale_id");

-- CreateIndex
CREATE INDEX "Expense_branch_id_idx" ON "tenant_template"."Expense"("branch_id");

-- CreateIndex
CREATE INDEX "Expense_created_at_idx" ON "tenant_template"."Expense"("created_at" DESC);
