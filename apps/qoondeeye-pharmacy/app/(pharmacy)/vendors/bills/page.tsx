import BillsPage from "@/components/features/bills/bills-page";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getPurchasesServer } from "@/lib/services/purchases.server";
import type { Purchase } from "@/lib/services/purchases";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);
  let initialPurchases: Purchase[] = [];
  try {
    initialPurchases = await getPurchasesServer(ctx);
  } catch {
    initialPurchases = [];
  }

  return (
    <BillsPage initialPurchases={initialPurchases} serverPrefetched />
  );
}
