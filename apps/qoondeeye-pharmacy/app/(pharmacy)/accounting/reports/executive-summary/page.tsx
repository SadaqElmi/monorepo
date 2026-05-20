import { format, startOfMonth } from "date-fns";

import ExecutiveSummaryReportClient from "@/components/accounting/reports/executive-summary-client";
import { loadReportPage } from "@/lib/server-page-data";
import { getExecutiveSummaryServer } from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  let initialData = null;
  let defaultFrom = format(startOfMonth(now), "yyyy-MM-dd");
  let defaultTo = format(now, "yyyy-MM-dd");

  try {
    const { data } = await loadReportPage(searchParams, async (ctx) => {
      defaultFrom = ctx.filters.from ?? format(startOfMonth(now), "yyyy-MM-dd");
      defaultTo = ctx.filters.to ?? format(now, "yyyy-MM-dd");
      return getExecutiveSummaryServer(ctx, defaultFrom, defaultTo);
    });
    initialData = data;
  } catch {
    /* client refetch */
  }

  return (
    <ExecutiveSummaryReportClient
      initialData={initialData}
      serverPrefetched={initialData != null}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
