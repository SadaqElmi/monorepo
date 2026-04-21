-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tenant_template";

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "schema_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password" TEXT NOT NULL,
    "name" VARCHAR(200),
    "role" VARCHAR(50) NOT NULL DEFAULT 'super_admin',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200),
    "email" VARCHAR(200),
    "password" TEXT,
    "pin_hash" TEXT,
    "role_id" UUID,
    "branch_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Branch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."RolePermission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "tenant_template"."ProductCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "slug" VARCHAR(255),

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "generic_name" VARCHAR(255),
    "barcode" VARCHAR(100),
    "list_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "strength" VARCHAR(100),
    "formulation" VARCHAR(100),
    "category_id" UUID,
    "unit" VARCHAR(50),
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Supplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Customer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."PatientLoan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "branch_id" UUID,
    "sale_id" UUID,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ongoing',
    "due_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."PatientLoanPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(50),
    "payment_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientLoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Purchase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID,
    "branch_id" UUID,
    "invoice_number" VARCHAR(100),
    "total_amount" DECIMAL(12,2),
    "purchase_date" DATE,
    "on_credit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."PurchaseItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_id" UUID NOT NULL,
    "branch_id" UUID,
    "product_id" UUID,
    "batch_id" UUID,
    "quantity" INTEGER,
    "cost_price" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "expiry_date" DATE,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "product_id" UUID,
    "batch_number" VARCHAR(100),
    "expiry_date" DATE,
    "quantity" INTEGER,
    "cost_price" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,
    "branch_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Sale" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "receipt_number" VARCHAR(20),
    "total_amount" DECIMAL(12,2),
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sale_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."SaleItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "branch_id" UUID,
    "product_id" UUID,
    "batch_id" UUID,
    "quantity" INTEGER,
    "price" DECIMAL(10,2),
    "total" DECIMAL(10,2),

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."SaleReturn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "branch_id" UUID,
    "reason" TEXT,
    "return_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refund_method" VARCHAR(50),
    "refund_amount" DECIMAL(12,2),

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."ReturnVoucher" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "token" VARCHAR(80) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "sale_return_id" UUID,
    "expires_at" TIMESTAMP(6),
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."SaleReturnItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_return_id" UUID NOT NULL,
    "product_id" UUID,
    "batch_id" UUID,
    "sale_item_id" UUID,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID,
    "method" VARCHAR(50),
    "amount" DECIMAL(10,2),
    "paid_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."ExpenseCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "gl_account_key" VARCHAR(50),

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Expense" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "branch_id" UUID,
    "amount" DECIMAL(12,2),
    "description" TEXT,
    "expense_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255),
    "message" TEXT,
    "type" VARCHAR(50),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_schema_name_key" ON "Tenant"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "tenant_template"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "tenant_template"."Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "tenant_template"."Permission"("name");

-- CreateIndex
CREATE INDEX "ProductCategory_branch_id_idx" ON "tenant_template"."ProductCategory"("branch_id");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "tenant_template"."Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_branch_id_idx" ON "tenant_template"."Product"("branch_id");

-- CreateIndex
CREATE INDEX "Batch_expiry_date_idx" ON "tenant_template"."Batch"("expiry_date");

-- CreateIndex
CREATE INDEX "Batch_branch_id_product_id_expiry_date_created_at_idx" ON "tenant_template"."Batch"("branch_id", "product_id", "expiry_date", "created_at");

-- CreateIndex
CREATE INDEX "Inventory_product_id_idx" ON "tenant_template"."Inventory"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_product_id_branch_id_key" ON "tenant_template"."Inventory"("product_id", "branch_id");

-- CreateIndex
CREATE INDEX "Sale_sale_date_idx" ON "tenant_template"."Sale"("sale_date");

-- CreateIndex
CREATE INDEX "Sale_branch_id_receipt_number_idx" ON "tenant_template"."Sale"("branch_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_branch_receipt_unique" ON "tenant_template"."Sale"("branch_id", "receipt_number");

-- CreateIndex
CREATE INDEX "SaleReturn_sale_id_idx" ON "tenant_template"."SaleReturn"("sale_id");

-- CreateIndex
CREATE INDEX "SaleReturn_return_date_idx" ON "tenant_template"."SaleReturn"("return_date");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnVoucher_token_key" ON "tenant_template"."ReturnVoucher"("token");

-- CreateIndex
CREATE INDEX "ReturnVoucher_sale_id_idx" ON "tenant_template"."ReturnVoucher"("sale_id");

-- CreateIndex
CREATE INDEX "ReturnVoucher_branch_id_idx" ON "tenant_template"."ReturnVoucher"("branch_id");

-- CreateIndex
CREATE INDEX "ReturnVoucher_token_idx" ON "tenant_template"."ReturnVoucher"("token");

-- CreateIndex
CREATE INDEX "SaleReturnItem_sale_return_id_idx" ON "tenant_template"."SaleReturnItem"("sale_return_id");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tenant_template"."Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."User" ADD CONSTRAINT "User_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."RolePermission" ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tenant_template"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."RolePermission" ADD CONSTRAINT "RolePermission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tenant_template"."Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ProductCategory" ADD CONSTRAINT "ProductCategory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Product" ADD CONSTRAINT "Product_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Product" ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tenant_template"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoan" ADD CONSTRAINT "PatientLoan_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_template"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoan" ADD CONSTRAINT "PatientLoan_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoan" ADD CONSTRAINT "PatientLoan_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PatientLoanPayment" ADD CONSTRAINT "PatientLoanPayment_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "tenant_template"."PatientLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Purchase" ADD CONSTRAINT "Purchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "tenant_template"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Purchase" ADD CONSTRAINT "Purchase_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "tenant_template"."Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Batch" ADD CONSTRAINT "Batch_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Batch" ADD CONSTRAINT "Batch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Inventory" ADD CONSTRAINT "Inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Inventory" ADD CONSTRAINT "Inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Sale" ADD CONSTRAINT "Sale_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleReturn" ADD CONSTRAINT "SaleReturn_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleReturn" ADD CONSTRAINT "SaleReturn_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "tenant_template"."SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "tenant_template"."SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "tenant_template"."SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "tenant_template"."SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Payment" ADD CONSTRAINT "Payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Expense" ADD CONSTRAINT "Expense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tenant_template"."ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Expense" ADD CONSTRAINT "Expense_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
