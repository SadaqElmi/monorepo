/*
  Warnings:

  - You are about to drop the `domains` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `batches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `branches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cash_accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cash_transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `customers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `expense_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `expenses` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inventory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notifications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchases` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sale_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sales` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suppliers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "domains" DROP CONSTRAINT "domains_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."batches" DROP CONSTRAINT "batches_product_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."cash_transactions" DROP CONSTRAINT "cash_transactions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."expenses" DROP CONSTRAINT "expenses_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."expenses" DROP CONSTRAINT "expenses_category_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."inventory" DROP CONSTRAINT "inventory_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."inventory" DROP CONSTRAINT "inventory_product_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."payments" DROP CONSTRAINT "payments_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."products" DROP CONSTRAINT "products_category_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."purchase_items" DROP CONSTRAINT "purchase_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."purchase_items" DROP CONSTRAINT "purchase_items_purchase_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."purchases" DROP CONSTRAINT "purchases_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."purchases" DROP CONSTRAINT "purchases_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."sale_items" DROP CONSTRAINT "sale_items_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."sale_items" DROP CONSTRAINT "sale_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."sale_items" DROP CONSTRAINT "sale_items_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."sales" DROP CONSTRAINT "sales_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."sales" DROP CONSTRAINT "sales_customer_id_fkey";

-- DropTable
DROP TABLE "domains";

-- DropTable
DROP TABLE "system_users";

-- DropTable
DROP TABLE "tenants";

-- DropTable
DROP TABLE "tenant_template"."batches";

-- DropTable
DROP TABLE "tenant_template"."branches";

-- DropTable
DROP TABLE "tenant_template"."cash_accounts";

-- DropTable
DROP TABLE "tenant_template"."cash_transactions";

-- DropTable
DROP TABLE "tenant_template"."customers";

-- DropTable
DROP TABLE "tenant_template"."expense_categories";

-- DropTable
DROP TABLE "tenant_template"."expenses";

-- DropTable
DROP TABLE "tenant_template"."inventory";

-- DropTable
DROP TABLE "tenant_template"."notifications";

-- DropTable
DROP TABLE "tenant_template"."payments";

-- DropTable
DROP TABLE "tenant_template"."product_categories";

-- DropTable
DROP TABLE "tenant_template"."products";

-- DropTable
DROP TABLE "tenant_template"."purchase_items";

-- DropTable
DROP TABLE "tenant_template"."purchases";

-- DropTable
DROP TABLE "tenant_template"."sale_items";

-- DropTable
DROP TABLE "tenant_template"."sales";

-- DropTable
DROP TABLE "tenant_template"."suppliers";

-- DropTable
DROP TABLE "tenant_template"."users";

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
CREATE TABLE "SystemUser" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password" TEXT NOT NULL,
    "name" VARCHAR(200),
    "tenant_id" UUID,
    "role" VARCHAR(50) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200),
    "email" VARCHAR(200),
    "password" TEXT,
    "role" VARCHAR(50),
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
CREATE TABLE "tenant_template"."ProductCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "generic_name" VARCHAR(255),
    "barcode" VARCHAR(100),
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
CREATE TABLE "tenant_template"."Purchase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID,
    "branch_id" UUID,
    "invoice_number" VARCHAR(100),
    "total_amount" DECIMAL(12,2),
    "purchase_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."PurchaseItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" INTEGER,
    "cost_price" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "expiry_date" DATE,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."Batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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
    "customer_id" UUID,
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
    "product_id" UUID,
    "batch_id" UUID,
    "quantity" INTEGER,
    "price" DECIMAL(10,2),
    "total" DECIMAL(10,2),

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "tenant_template"."CashAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "type" VARCHAR(50),
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."CashTransaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID,
    "type" VARCHAR(10),
    "amount" DECIMAL(12,2),
    "reference" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "SystemUser_email_key" ON "SystemUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "tenant_template"."User"("email");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "tenant_template"."Product"("barcode");

-- CreateIndex
CREATE INDEX "Batch_expiry_date_idx" ON "tenant_template"."Batch"("expiry_date");

-- CreateIndex
CREATE INDEX "Inventory_product_id_idx" ON "tenant_template"."Inventory"("product_id");

-- CreateIndex
CREATE INDEX "Sale_sale_date_idx" ON "tenant_template"."Sale"("sale_date");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Product" ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tenant_template"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Purchase" ADD CONSTRAINT "Purchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "tenant_template"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Purchase" ADD CONSTRAINT "Purchase_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "tenant_template"."Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Batch" ADD CONSTRAINT "Batch_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Inventory" ADD CONSTRAINT "Inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Inventory" ADD CONSTRAINT "Inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Sale" ADD CONSTRAINT "Sale_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Sale" ADD CONSTRAINT "Sale_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_template"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Payment" ADD CONSTRAINT "Payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Expense" ADD CONSTRAINT "Expense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tenant_template"."ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."Expense" ADD CONSTRAINT "Expense_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."CashTransaction" ADD CONSTRAINT "CashTransaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tenant_template"."CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
