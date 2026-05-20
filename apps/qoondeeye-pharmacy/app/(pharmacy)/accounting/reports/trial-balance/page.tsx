import { format } from "date-fns";

import TrialBalanceReportClient from "@/components/accounting/reports/trial-balance-client";
import { loadReportPage } from "@/lib/server-page-data";
import { getTrialBalanceServer } from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  let initialRows = null;
  let defaultAsOf = format(now, "yyyy-MM-dd");

  try {
    const { ctx, data } = await loadReportPage(searchParams, async (ctx) => {
      defaultAsOf = ctx.filters.asOf ?? format(now, "yyyy-MM-dd");
      return getTrialBalanceServer(ctx, defaultAsOf);
    });
    void ctx;
    initialRows = data;
  } catch {
    /* client refetch */
  }

  return (
    <TrialBalanceReportClient
      initialRows={initialRows}
      serverPrefetched={initialRows != null}
      defaultAsOf={defaultAsOf}
    />
  );
}
