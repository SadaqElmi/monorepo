import { ErpImportWizard } from "@/components/features/import/erp-import-wizard";
import { requireServerSession } from "@/lib/auth-server";

const OPENING_STOCK_CONFIG = {
  importType: "opening_stock" as const,
  title: "Opening stock import",
  description:
    "One-time migration of on-hand quantities. Products must exist in the catalog first.",
  docHref: "/docs/product-excel-import.md",
  historyHref: "/inventory/opening-stock/import/history",
  jobDetailBasePath: "/inventory/opening-stock/import",
  templateFilename: "opening-stock-import-template.xlsx",
  columns: [
    { field: "branch_code", label: "Branch" },
    { field: "item_no", label: "Item No" },
    { field: "opening_qty", label: "Qty" },
    { field: "cost_price", label: "Cost" },
    { field: "batch_number", label: "Batch" },
    { field: "expiry_date", label: "Expiry" },
    { field: "opening_date", label: "Date" },
  ],
};

export default async function OpeningStockImportPage() {
  await requireServerSession();
  return <ErpImportWizard config={OPENING_STOCK_CONFIG} />;
}
