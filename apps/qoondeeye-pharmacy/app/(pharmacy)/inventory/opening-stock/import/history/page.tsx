import { ImportHistoryClient } from "@/components/features/import/import-history-client";
import { requireServerSession } from "@/lib/auth-server";

export default async function OpeningStockImportHistoryPage() {
  await requireServerSession();
  return (
    <ImportHistoryClient
      importType="opening_stock"
      title="Opening stock import history"
      backHref="/inventory/opening-stock/import"
    />
  );
}
