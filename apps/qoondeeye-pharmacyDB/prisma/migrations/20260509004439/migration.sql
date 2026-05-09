/*
  Warnings:

  - You are about to drop the `CashAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CashTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `audit_log_archive` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `branches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chart_of_accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `consolidation_adjustments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `consolidation_journal_links` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `consolidation_run_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `consolidation_runs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `entities` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `entity_branches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `entity_ownership` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fx_rates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `journal_entries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `journal_lines` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tenant_template"."CashTransaction" DROP CONSTRAINT "CashTransaction_account_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."audit_logs" DROP CONSTRAINT "audit_logs_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."chart_of_accounts" DROP CONSTRAINT "chart_of_accounts_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."chart_of_accounts" DROP CONSTRAINT "chart_of_accounts_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."consolidation_adjustments" DROP CONSTRAINT "consolidation_adjustments_applied_run_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."consolidation_adjustments" DROP CONSTRAINT "consolidation_adjustments_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."consolidation_journal_links" DROP CONSTRAINT "consolidation_journal_links_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."consolidation_journal_links" DROP CONSTRAINT "consolidation_journal_links_run_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."consolidation_run_events" DROP CONSTRAINT "consolidation_run_events_run_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."consolidation_runs" DROP CONSTRAINT "consolidation_runs_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."entities" DROP CONSTRAINT "entities_parent_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."entity_branches" DROP CONSTRAINT "entity_branches_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."entity_branches" DROP CONSTRAINT "entity_branches_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."entity_ownership" DROP CONSTRAINT "entity_ownership_child_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."entity_ownership" DROP CONSTRAINT "entity_ownership_parent_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."journal_entries" DROP CONSTRAINT "journal_entries_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."journal_lines" DROP CONSTRAINT "journal_lines_account_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."journal_lines" DROP CONSTRAINT "journal_lines_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."pos_sessions" DROP CONSTRAINT "pos_sessions_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_template"."pos_statements" DROP CONSTRAINT "pos_statements_journal_entry_id_fkey";

-- DropIndex
DROP INDEX "tenant_template"."idx_inventory_branch_product";

-- DropIndex
DROP INDEX "tenant_template"."idx_purchases_branch_purchase_date";

-- DropIndex
DROP INDEX "tenant_template"."idx_sales_branch_sale_date";

-- DropIndex
DROP INDEX "tenant_template"."idx_users_branch_id";

-- AlterTable
ALTER TABLE "pos_devices" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant_template"."ExpenseCategory" ADD COLUMN     "gl_account_key" VARCHAR(50);

-- AlterTable
ALTER TABLE "tenant_template"."Purchase" ADD COLUMN     "on_credit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenant_template"."PurchaseItem" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "tenant_template"."SaleItem" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "tenant_template"."SaleReturn" ADD COLUMN     "refund_amount" DECIMAL(12,2),
ADD COLUMN     "refund_method" VARCHAR(50);

-- AlterTable
ALTER TABLE "tenant_template"."User" ADD COLUMN     "pin_hash" TEXT;

-- DropTable
DROP TABLE "tenant_template"."CashAccount";

-- DropTable
DROP TABLE "tenant_template"."CashTransaction";

-- DropTable
DROP TABLE "tenant_template"."audit_log_archive";

-- DropTable
DROP TABLE "tenant_template"."audit_logs";

-- DropTable
DROP TABLE "tenant_template"."branches";

-- DropTable
DROP TABLE "tenant_template"."chart_of_accounts";

-- DropTable
DROP TABLE "tenant_template"."consolidation_adjustments";

-- DropTable
DROP TABLE "tenant_template"."consolidation_journal_links";

-- DropTable
DROP TABLE "tenant_template"."consolidation_run_events";

-- DropTable
DROP TABLE "tenant_template"."consolidation_runs";

-- DropTable
DROP TABLE "tenant_template"."entities";

-- DropTable
DROP TABLE "tenant_template"."entity_branches";

-- DropTable
DROP TABLE "tenant_template"."entity_ownership";

-- DropTable
DROP TABLE "tenant_template"."fx_rates";

-- DropTable
DROP TABLE "tenant_template"."journal_entries";

-- DropTable
DROP TABLE "tenant_template"."journal_lines";

-- DropTable
DROP TABLE "tenant_template"."users";

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

-- CreateIndex
CREATE UNIQUE INDEX "ReturnVoucher_token_key" ON "tenant_template"."ReturnVoucher"("token");

-- CreateIndex
CREATE INDEX "ReturnVoucher_sale_id_idx" ON "tenant_template"."ReturnVoucher"("sale_id");

-- CreateIndex
CREATE INDEX "ReturnVoucher_branch_id_idx" ON "tenant_template"."ReturnVoucher"("branch_id");

-- CreateIndex
CREATE INDEX "ReturnVoucher_token_idx" ON "tenant_template"."ReturnVoucher"("token");

-- CreateIndex
CREATE INDEX "User_staff_id_idx" ON "tenant_template"."User"("staff_id");

-- AddForeignKey
ALTER TABLE "tenant_template"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."pos_sessions" ADD CONSTRAINT "pos_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."SaleItem" ADD CONSTRAINT "SaleItem_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tenant_template"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "tenant_template"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "tenant_template"."SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_template"."ReturnVoucher" ADD CONSTRAINT "ReturnVoucher_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "tenant_template"."SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "tenant_template"."idx_sales_pos_session_id" RENAME TO "Sale_pos_session_id_idx";

-- RenameIndex
ALTER INDEX "tenant_template"."sales_branch_id_receipt_number_idx" RENAME TO "Sale_branch_id_receipt_number_idx";

-- RenameIndex
ALTER INDEX "tenant_template"."idx_pos_sessions_branch_opened" RENAME TO "pos_sessions_branch_id_opened_at_idx";

-- RenameIndex
ALTER INDEX "tenant_template"."idx_pos_sessions_branch_status" RENAME TO "pos_sessions_branch_id_status_idx";

-- RenameIndex
ALTER INDEX "tenant_template"."idx_pos_statements_session" RENAME TO "pos_statements_session_id_idx";
