import { ErpImportWizard } from "@/components/features/import/erp-import-wizard";
import { PRODUCT_IMPORT_COLUMNS } from "@/components/features/import/import-preview-utils";
import { requireServerSession } from "@/lib/auth-server";

const PRODUCT_CONFIG = {
  importType: "product" as const,
  title: "Product catalog import",
  description:
    "Import or update product master data and UOM setup — no stock movement or accounting.",
  docHref: "/docs/product-excel-import.md",
  historyHref: "/inventory/products/import/history",
  jobDetailBasePath: "/inventory/products/import",
  templateFilename: "product-import-template.xlsx",
  columns: PRODUCT_IMPORT_COLUMNS,
};

export default async function ProductImportPage() {
  await requireServerSession();
  return <ErpImportWizard config={PRODUCT_CONFIG} />;
}
