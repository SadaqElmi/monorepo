import { format } from "date-fns";

import DepreciationScheduleReportClient from "@/components/accounting/reports/depreciation-schedule-client";
import { filterDepreciationTrialBalanceLines } from "@/lib/depreciation-trial-balance-filter";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getTrialBalanceServer } from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);
  const now = new Date();
  const defaultAsOf = ctx.filters.asOf ?? format(now, "yyyy-MM-dd");

  let initialRows = null;
  try {
    const all = await getTrialBalanceServer(ctx, defaultAsOf);
    initialRows = filterDepreciationTrialBalanceLines(all);
  } catch {
    /* client refetch */
  }

  return (
    <DepreciationScheduleReportClient
      initialRows={initialRows}
      serverPrefetched={initialRows != null}
      defaultAsOf={defaultAsOf}
    />
  );
}
