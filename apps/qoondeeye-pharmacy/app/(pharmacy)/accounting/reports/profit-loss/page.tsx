import { format, startOfMonth } from "date-fns";

import ProfitLossReportClient from "@/components/accounting/reports/profit-loss-client";
import { loadReportPage } from "@/lib/server-page-data";
import {
  getIncomeStatementServer,
  getVarianceAnalysisServer,
} from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  let initialData = null;
  let initialVarianceDrivers = null;
  let defaultFrom = format(startOfMonth(now), "yyyy-MM-dd");
  let defaultTo = format(now, "yyyy-MM-dd");

  try {
    const { data } = await loadReportPage(searchParams, async (ctx) => {
      defaultFrom = ctx.filters.from ?? format(startOfMonth(now), "yyyy-MM-dd");
      defaultTo = ctx.filters.to ?? format(now, "yyyy-MM-dd");
      const [pl, variance] = await Promise.all([
        getIncomeStatementServer(ctx, defaultFrom, defaultTo),
        getVarianceAnalysisServer(ctx, defaultFrom, defaultTo, "inventory"),
      ]);
      return { pl, varianceRow: variance.rows?.[0] ?? null };
    });
    initialData = data.pl;
    initialVarianceDrivers = data.varianceRow;
  } catch {
    /* client refetch */
  }

  return (
    <ProfitLossReportClient
      initialData={initialData}
      initialVarianceDrivers={initialVarianceDrivers}
      serverPrefetched={initialData != null}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
