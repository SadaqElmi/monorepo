-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200),
    "staff_id" VARCHAR(120),
    "email" VARCHAR(200),
    "password" TEXT,
    "pin_hash" TEXT,
    "role_id" UUID,
    "branch_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "code" VARCHAR(32),
    "phone" VARCHAR(50),
    "address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "slug" VARCHAR(255),

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "item_no" VARCHAR(50),
    "name" VARCHAR(255) NOT NULL,
    "generic_name" VARCHAR(255),
    "barcode" VARCHAR(100),
    "list_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "strength" VARCHAR(100),
    "formulation" VARCHAR(100),
    "category_id" UUID,
    "supplier_id" UUID,
    "unit" VARCHAR(50),
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uoms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(32),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_uoms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "conversion_factor_to_base" DECIMAL(18,6) NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "is_purchase_default" BOOLEAN NOT NULL DEFAULT false,
    "is_sales_default" BOOLEAN NOT NULL DEFAULT false,
    "is_pos_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_uoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_uom_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "selling_price" DECIMAL(14,2),
    "cost_price" DECIMAL(14,4),
    "initial_cost_price" DECIMAL(14,4),
    "last_purchase_cost" DECIMAL(14,4),
    "last_purchase_at" TIMESTAMP(6),
    "last_purchase_id" UUID,
    "last_purchase_item_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_uom_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_uom_barcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "barcode" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_uom_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "supplier_type" VARCHAR(20) NOT NULL DEFAULT 'local',
    "country" VARCHAR(100),
    "city" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "last_cost_price" DECIMAL(10,2),
    "supplier_item_code" VARCHAR(100),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_supplier_uom_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "current_cost_price" DECIMAL(14,4),
    "last_purchase_cost" DECIMAL(14,4),
    "last_purchase_at" TIMESTAMP(6),
    "last_purchase_id" UUID,
    "last_purchase_item_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_supplier_uom_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_price_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "purchase_id" UUID,
    "purchase_item_id" UUID,
    "old_cost_price" DECIMAL(14,4),
    "new_cost_price" DECIMAL(14,4) NOT NULL,
    "entered_quantity" DECIMAL(14,4),
    "base_quantity" INTEGER,
    "conversion_factor_snapshot" DECIMAL(18,6),
    "purchase_date" DATE,
    "source" VARCHAR(50) NOT NULL DEFAULT 'purchase_invoice',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price_group_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "price_group_id" UUID NOT NULL,
    "selling_price" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_group_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "uom_id" UUID,
    "price_group_id" UUID,
    "old_selling_price" DECIMAL(14,2),
    "new_selling_price" DECIMAL(14,2),
    "old_cost_price" DECIMAL(14,4),
    "new_cost_price" DECIMAL(14,4),
    "change_reason" TEXT,
    "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "no" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'disabled',
    "price_group_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "validation_period_id" VARCHAR(100),
    "start_date" DATE,
    "end_date" DATE,
    "offer_type" VARCHAR(50) NOT NULL,
    "discount_type" VARCHAR(50) NOT NULL,
    "discount_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "apply_to" VARCHAR(50) NOT NULL DEFAULT 'product',
    "branch_scope" VARCHAR(50) NOT NULL DEFAULT 'all',
    "stacking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offer_id" UUID NOT NULL,
    "product_id" UUID,
    "category_id" UUID,
    "min_quantity" DECIMAL(14,4),
    "buy_quantity" DECIMAL(14,4),
    "get_quantity" DECIMAL(14,4),
    "special_price" DECIMAL(14,2),
    "bundle_product_ids" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offer_id" UUID NOT NULL,
    "sale_id" UUID,
    "sale_item_id" UUID,
    "branch_id" UUID,
    "product_id" UUID,
    "price_group_id" UUID,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "customer_no" VARCHAR(32),
    "credit_limit" DECIMAL(12,2),
    "credit_status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "member_card_no" VARCHAR(64),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_loans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "branch_id" UUID,
    "sale_id" UUID,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ongoing',
    "due_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_loan_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(50),
    "payment_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_loan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID,
    "branch_id" UUID,
    "invoice_number" VARCHAR(100),
    "supplier_invoice_no" VARCHAR(100),
    "purchase_order_no" VARCHAR(100),
    "total_amount" DECIMAL(12,2),
    "purchase_date" DATE,
    "order_date" DATE,
    "posting_date" DATE,
    "due_date" DATE,
    "status" VARCHAR(32) NOT NULL DEFAULT 'closed',
    "notes" TEXT,
    "on_credit" BOOLEAN NOT NULL DEFAULT false,
    "released_at" TIMESTAMP(6),
    "received_at" TIMESTAMP(6),
    "invoiced_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_id" UUID NOT NULL,
    "branch_id" UUID,
    "product_id" UUID,
    "batch_id" UUID,
    "uom_id" UUID,
    "quantity" INTEGER,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "conversion_factor_snapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "base_quantity" INTEGER NOT NULL DEFAULT 0,
    "base_unit_cost" DECIMAL(14,4),
    "cost_price" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "update_selling_price" BOOLEAN NOT NULL DEFAULT false,
    "expiry_date" DATE,
    "line_discount" DECIMAL(12,2) DEFAULT 0,
    "tax_amount" DECIMAL(12,2) DEFAULT 0,
    "line_notes" TEXT,
    "planned_batch_number" VARCHAR(100),
    "planned_expiry_date" DATE,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "product_id" UUID,
    "batch_number" VARCHAR(100),
    "expiry_date" DATE,
    "quantity" INTEGER,
    "cost_price" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,
    "branch_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "device_id" UUID,
    "staff_user_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(6),

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "journal_entry_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(6),

    CONSTRAINT "pos_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "payment_bucket" VARCHAR(32) NOT NULL,
    "expected_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pos_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "pos_session_id" UUID,
    "receipt_number" VARCHAR(20),
    "total_amount" DECIMAL(12,2),
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sale_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" UUID,
    "on_account" BOOLEAN NOT NULL DEFAULT false,
    "credit_override_manager_id" UUID,
    "credit_override_reason" TEXT,
    "credit_override_at" TIMESTAMP(6),
    "due_date" DATE,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "branch_id" UUID,
    "product_id" UUID,
    "batch_id" UUID,
    "uom_id" UUID,
    "price_group_id" UUID,
    "offer_id" UUID,
    "quantity" INTEGER,
    "entered_quantity" DECIMAL(14,4),
    "conversion_factor_snapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "base_quantity" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "line_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_source" VARCHAR(50),
    "misc_charge_kind" VARCHAR(32),

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "branch_id" UUID,
    "reason" TEXT,
    "return_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refund_method" VARCHAR(50),
    "refund_amount" DECIMAL(12,2),

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_vouchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "uom_id" UUID,
    "quantity" INTEGER NOT NULL,
    "entered_quantity" DECIMAL(14,4),
    "conversion_factor_snapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "base_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "token" VARCHAR(80) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "sale_return_id" UUID,
    "expires_at" TIMESTAMP(6),
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_return_id" UUID NOT NULL,
    "product_id" UUID,
    "batch_id" UUID,
    "sale_item_id" UUID,
    "uom_id" UUID,
    "quantity" INTEGER NOT NULL,
    "entered_quantity" DECIMAL(14,4),
    "conversion_factor_snapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "base_quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID,
    "method" VARCHAR(50),
    "amount" DECIMAL(10,2),
    "paid_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "gl_account_key" VARCHAR(50),

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "branch_id" UUID,
    "amount" DECIMAL(12,2),
    "description" TEXT,
    "expense_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255),
    "message" TEXT,
    "type" VARCHAR(50),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_staff_id_idx" ON "users"("staff_id");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "product_categories_branch_id_idx" ON "product_categories"("branch_id");

-- CreateIndex
CREATE INDEX "product_categories_parent_id_idx" ON "product_categories"("parent_id");

-- CreateIndex
CREATE INDEX "product_categories_branch_id_name_idx" ON "product_categories"("branch_id", "name");

-- CreateIndex
CREATE INDEX "products_barcode_idx" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_branch_id_idx" ON "products"("branch_id");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at" DESC);

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");

-- CreateIndex
CREATE INDEX "products_branch_id_created_at_idx" ON "products"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uoms_code_key" ON "uoms"("code");

-- CreateIndex
CREATE INDEX "idx_product_uoms_product_id" ON "product_uoms"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_uoms_uom_id" ON "product_uoms"("uom_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_uoms_product_uom_uq" ON "product_uoms"("product_id", "uom_id");

-- CreateIndex
CREATE INDEX "idx_product_uom_prices_product_uom" ON "product_uom_prices"("product_id", "uom_id");

-- CreateIndex
CREATE INDEX "idx_product_uom_barcodes_product_uom" ON "product_uom_barcodes"("product_id", "uom_id");

-- CreateIndex
CREATE INDEX "idx_product_uom_barcodes_barcode" ON "product_uom_barcodes"("barcode");

-- CreateIndex
CREATE INDEX "idx_product_suppliers_product_preferred" ON "product_suppliers"("product_id", "is_preferred");

-- CreateIndex
CREATE INDEX "idx_product_suppliers_supplier_product" ON "product_suppliers"("supplier_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_suppliers_product_supplier_uq" ON "product_suppliers"("product_id", "supplier_id");

-- CreateIndex
CREATE INDEX "idx_product_supplier_uom_costs_lookup" ON "product_supplier_uom_costs"("supplier_id", "product_id", "uom_id");

-- CreateIndex
CREATE INDEX "idx_product_supplier_uom_costs_product_uom" ON "product_supplier_uom_costs"("product_id", "uom_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_supplier_uom_costs_product_supplier_uom_uq" ON "product_supplier_uom_costs"("product_id", "supplier_id", "uom_id");

-- CreateIndex
CREATE INDEX "idx_supplier_price_history_lookup" ON "supplier_price_history"("product_id", "supplier_id", "uom_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_supplier_price_history_purchase" ON "supplier_price_history"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_groups_code_key" ON "price_groups"("code");

-- CreateIndex
CREATE INDEX "idx_product_price_group_prices_lookup" ON "product_price_group_prices"("product_id", "uom_id", "price_group_id");

-- CreateIndex
CREATE INDEX "idx_product_price_group_prices_group_active" ON "product_price_group_prices"("price_group_id", "active");

-- CreateIndex
CREATE INDEX "idx_product_price_history_product_created" ON "product_price_history"("product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_product_price_history_group_created" ON "product_price_history"("price_group_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_lists_no_key" ON "offer_lists"("no");

-- CreateIndex
CREATE INDEX "idx_offer_lists_status_dates_priority" ON "offer_lists"("status", "start_date", "end_date", "priority");

-- CreateIndex
CREATE INDEX "idx_offer_lists_group_status" ON "offer_lists"("price_group_id", "status");

-- CreateIndex
CREATE INDEX "idx_offer_rules_offer_id" ON "offer_rules"("offer_id");

-- CreateIndex
CREATE INDEX "idx_offer_rules_product_id" ON "offer_rules"("product_id");

-- CreateIndex
CREATE INDEX "idx_offer_rules_category_id" ON "offer_rules"("category_id");

-- CreateIndex
CREATE INDEX "idx_offer_redemptions_offer_created" ON "offer_redemptions"("offer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_offer_redemptions_sale_id" ON "offer_redemptions"("sale_id");

-- CreateIndex
CREATE INDEX "patient_loans_branch_id_idx" ON "patient_loans"("branch_id");

-- CreateIndex
CREATE INDEX "patient_loans_customer_id_idx" ON "patient_loans"("customer_id");

-- CreateIndex
CREATE INDEX "patient_loan_payments_loan_id_idx" ON "patient_loan_payments"("loan_id");

-- CreateIndex
CREATE INDEX "purchases_branch_id_idx" ON "purchases"("branch_id");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

-- CreateIndex
CREATE INDEX "purchases_invoice_number_idx" ON "purchases"("invoice_number");

-- CreateIndex
CREATE INDEX "purchases_supplier_invoice_no_idx" ON "purchases"("supplier_invoice_no");

-- CreateIndex
CREATE INDEX "purchases_purchase_order_no_idx" ON "purchases"("purchase_order_no");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE INDEX "purchases_branch_id_created_at_idx" ON "purchases"("branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items"("product_id");

-- CreateIndex
CREATE INDEX "purchase_items_branch_id_idx" ON "purchase_items"("branch_id");

-- CreateIndex
CREATE INDEX "purchase_items_uom_id_idx" ON "purchase_items"("uom_id");

-- CreateIndex
CREATE INDEX "batches_expiry_date_idx" ON "batches"("expiry_date");

-- CreateIndex
CREATE INDEX "batches_branch_id_product_id_expiry_date_created_at_idx" ON "batches"("branch_id", "product_id", "expiry_date", "created_at");

-- CreateIndex
CREATE INDEX "inventory_product_id_idx" ON "inventory"("product_id");

-- CreateIndex
CREATE INDEX "inventory_branch_id_idx" ON "inventory"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_id_branch_id_key" ON "inventory"("product_id", "branch_id");

-- CreateIndex
CREATE INDEX "pos_sessions_branch_id_status_idx" ON "pos_sessions"("branch_id", "status");

-- CreateIndex
CREATE INDEX "pos_sessions_branch_id_opened_at_idx" ON "pos_sessions"("branch_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "pos_statements_session_id_idx" ON "pos_statements"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_statement_lines_statement_bucket_unique" ON "pos_statement_lines"("statement_id", "payment_bucket");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_sale_date_idx" ON "sales"("sale_date");

-- CreateIndex
CREATE INDEX "sales_branch_id_sale_date_idx" ON "sales"("branch_id", "sale_date" DESC);

-- CreateIndex
CREATE INDEX "sales_branch_id_receipt_number_idx" ON "sales"("branch_id", "receipt_number");

-- CreateIndex
CREATE INDEX "sales_pos_session_id_idx" ON "sales"("pos_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_branch_receipt_unique" ON "sales"("branch_id", "receipt_number");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_items_branch_id_idx" ON "sale_items"("branch_id");

-- CreateIndex
CREATE INDEX "sale_items_branch_id_product_id_idx" ON "sale_items"("branch_id", "product_id");

-- CreateIndex
CREATE INDEX "sale_items_uom_id_idx" ON "sale_items"("uom_id");

-- CreateIndex
CREATE INDEX "sale_items_price_group_id_idx" ON "sale_items"("price_group_id");

-- CreateIndex
CREATE INDEX "sale_items_offer_id_idx" ON "sale_items"("offer_id");

-- CreateIndex
CREATE INDEX "sale_returns_sale_id_idx" ON "sale_returns"("sale_id");

-- CreateIndex
CREATE INDEX "sale_returns_return_date_idx" ON "sale_returns"("return_date");

-- CreateIndex
CREATE INDEX "sale_returns_branch_id_return_date_idx" ON "sale_returns"("branch_id", "return_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "return_vouchers_token_key" ON "return_vouchers"("token");

-- CreateIndex
CREATE INDEX "return_vouchers_sale_id_idx" ON "return_vouchers"("sale_id");

-- CreateIndex
CREATE INDEX "return_vouchers_branch_id_idx" ON "return_vouchers"("branch_id");

-- CreateIndex
CREATE INDEX "return_vouchers_token_idx" ON "return_vouchers"("token");

-- CreateIndex
CREATE INDEX "return_vouchers_uom_id_idx" ON "return_vouchers"("uom_id");

-- CreateIndex
CREATE INDEX "sale_return_items_sale_return_id_idx" ON "sale_return_items"("sale_return_id");

-- CreateIndex
CREATE INDEX "sale_return_items_uom_id_idx" ON "sale_return_items"("uom_id");

-- CreateIndex
CREATE INDEX "payments_sale_id_idx" ON "payments"("sale_id");

-- CreateIndex
CREATE INDEX "expenses_branch_id_idx" ON "expenses"("branch_id");

-- CreateIndex
CREATE INDEX "expenses_created_at_idx" ON "expenses"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uoms" ADD CONSTRAINT "product_uoms_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uoms" ADD CONSTRAINT "product_uoms_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_prices" ADD CONSTRAINT "product_uom_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_prices" ADD CONSTRAINT "product_uom_prices_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_prices" ADD CONSTRAINT "product_uom_prices_last_purchase_id_fkey" FOREIGN KEY ("last_purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_prices" ADD CONSTRAINT "product_uom_prices_last_purchase_item_id_fkey" FOREIGN KEY ("last_purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_barcodes" ADD CONSTRAINT "product_uom_barcodes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_barcodes" ADD CONSTRAINT "product_uom_barcodes_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_uom_costs" ADD CONSTRAINT "product_supplier_uom_costs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_uom_costs" ADD CONSTRAINT "product_supplier_uom_costs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_uom_costs" ADD CONSTRAINT "product_supplier_uom_costs_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_uom_costs" ADD CONSTRAINT "product_supplier_uom_costs_last_purchase_id_fkey" FOREIGN KEY ("last_purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_uom_costs" ADD CONSTRAINT "product_supplier_uom_costs_last_purchase_item_id_fkey" FOREIGN KEY ("last_purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_group_prices" ADD CONSTRAINT "product_price_group_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_group_prices" ADD CONSTRAINT "product_price_group_prices_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_group_prices" ADD CONSTRAINT "product_price_group_prices_price_group_id_fkey" FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_price_group_id_fkey" FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_lists" ADD CONSTRAINT "offer_lists_price_group_id_fkey" FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_rules" ADD CONSTRAINT "offer_rules_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_rules" ADD CONSTRAINT "offer_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_rules" ADD CONSTRAINT "offer_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_price_group_id_fkey" FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_loans" ADD CONSTRAINT "patient_loans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_loans" ADD CONSTRAINT "patient_loans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_loans" ADD CONSTRAINT "patient_loans_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_loan_payments" ADD CONSTRAINT "patient_loan_payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "patient_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_statements" ADD CONSTRAINT "pos_statements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_statement_lines" ADD CONSTRAINT "pos_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "pos_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_pos_session_id_fkey" FOREIGN KEY ("pos_session_id") REFERENCES "pos_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_price_group_id_fkey" FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_vouchers" ADD CONSTRAINT "return_vouchers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_vouchers" ADD CONSTRAINT "return_vouchers_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_vouchers" ADD CONSTRAINT "return_vouchers_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_vouchers" ADD CONSTRAINT "return_vouchers_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_vouchers" ADD CONSTRAINT "return_vouchers_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
