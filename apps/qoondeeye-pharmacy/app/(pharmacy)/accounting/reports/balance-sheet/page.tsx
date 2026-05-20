import { format } from "date-fns";

import BalanceSheetReportClient from "@/components/accounting/reports/balance-sheet-client";
import { loadReportPage } from "@/lib/server-page-data";
import { getBalanceSheetServer } from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  let initialData = null;
  let defaultAsOf = format(now, "yyyy-MM-dd");
  let defaultCompareAsOf = "";

  try {
    const { ctx, data } = await loadReportPage(searchParams, async (ctx) => {
      defaultAsOf = ctx.filters.asOf ?? format(now, "yyyy-MM-dd");
      defaultCompareAsOf = ctx.filters.compareAsOf ?? "";
      return getBalanceSheetServer(ctx, defaultAsOf, {
        compareAsOf: defaultCompareAsOf.trim() || undefined,
      });
    });
    void ctx;
    initialData = data;
  } catch {
    /* client refetch */
  }

  return (
    <BalanceSheetReportClient
      initialData={initialData}
      serverPrefetched={initialData != null}
      defaultAsOf={defaultAsOf}
      defaultCompareAsOf={defaultCompareAsOf}
    />
  );
}
