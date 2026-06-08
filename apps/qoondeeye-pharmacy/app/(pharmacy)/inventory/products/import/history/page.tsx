import { ImportHistoryClient } from "@/components/features/import/import-history-client";
import { requireServerSession } from "@/lib/auth-server";

export default async function Page() {
  await requireServerSession();
  return (
    <ImportHistoryClient
      importType="product"
      title="Product import history"
      backHref="/inventory/products/import"
    />
  );
}
