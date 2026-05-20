import { format, startOfMonth } from "date-fns";

import AnalyticReportClient from "@/components/accounting/reports/analytic-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getAnalyticReportServer } from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);
  const now = new Date();
  const defaultFrom =
    ctx.filters.from ?? format(startOfMonth(now), "yyyy-MM-dd");
  const defaultTo = ctx.filters.to ?? format(now, "yyyy-MM-dd");

  let initialData = null;
  try {
    initialData = await getAnalyticReportServer(ctx, defaultFrom, defaultTo);
  } catch {
    /* client refetch */
  }

  return (
    <AnalyticReportClient
      initialData={initialData}
      serverPrefetched={initialData != null}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
