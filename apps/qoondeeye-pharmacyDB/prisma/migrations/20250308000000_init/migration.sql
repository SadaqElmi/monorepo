-- CreateEnum
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tenant_template";

-- CreateTable (public schema)
CREATE TABLE "public"."tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "schema_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password" TEXT NOT NULL,
    "name" VARCHAR(200),
    "tenant_id" UUID,
    "role" VARCHAR(50) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable (tenant_template schema)
CREATE TABLE "tenant_template"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200),
    "email" VARCHAR(200),
    "password" TEXT,
    "role" VARCHAR(50),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "generic_name" VARCHAR(255),
    "barcode" VARCHAR(100),
    "category_id" UUID,
    "unit" VARCHAR(50),
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID,
    "branch_id" UUID,
    "invoice_number" VARCHAR(100),
    "total_amount" NUMERIC(12,2),
    "purchase_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."purchase_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" INTEGER,
    "cost_price" NUMERIC(10,2),
    "selling_price" NUMERIC(10,2),
    "expiry_date" DATE,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,
    "batch_number" VARCHAR(100),
    "expiry_date" DATE,
    "quantity" INTEGER,
    "cost_price" NUMERIC(10,2),
    "selling_price" NUMERIC(10,2),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,
    "branch_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "customer_id" UUID,
    "total_amount" NUMERIC(12,2),
    "discount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "tax" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "sale_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."sale_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "product_id" UUID,
    "batch_id" UUID,
    "quantity" INTEGER,
    "price" NUMERIC(10,2),
    "total" NUMERIC(10,2),

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID,
    "method" VARCHAR(50),
    "amount" NUMERIC(10,2),
    "paid_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."expense_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "branch_id" UUID,
    "amount" NUMERIC(12,2),
    "description" TEXT,
    "expense_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."cash_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "type" VARCHAR(50),
    "balance" NUMERIC(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."cash_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID,
    "type" VARCHAR(10),
    "amount" NUMERIC(12,2),
    "reference" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_template"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255),
    "message" TEXT,
    "type" VARCHAR(50),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "public"."tenants"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "domains_domain_key" ON "public"."domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "system_users_email_key" ON "public"."system_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "tenant_template"."users"("email");

-- CreateIndex
CREATE INDEX "idx_products_barcode" ON "tenant_template"."products"("barcode");

-- CreateIndex
CREATE INDEX "idx_batches_expiry" ON "tenant_template"."batches"("expiry_date");

-- CreateIndex
CREATE INDEX "idx_inventory_product" ON "tenant_template"."inventory"("product_id");

-- CreateIndex
CREATE INDEX "idx_sales_date" ON "tenant_template"."sales"("sale_date");

-- AddForeignKey (public)
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (tenant_template)
ALTER TABLE "tenant_template"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tenant_template"."product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "tenant_template"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."purchases" ADD CONSTRAINT "purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "tenant_template"."purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."inventory" ADD CONSTRAINT "inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_template"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_template"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."sale_items" ADD CONSTRAINT "sale_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tenant_template"."batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tenant_template"."expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_template"."cash_transactions" ADD CONSTRAINT "cash_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tenant_template"."cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
