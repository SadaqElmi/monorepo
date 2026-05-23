import { format, startOfMonth } from "date-fns";

import ConsolidatedReportsClient from "@/components/accounting/reports/consolidated-client";
import { loadReportPageContext } from "@/lib/server-page-props";

/** Reports load on client after user runs them (no heavy RSC prefetch). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);
  const now = new Date();
  const defaultAsOf = ctx.filters.asOf ?? format(now, "yyyy-MM-dd");
  const defaultFrom =
    ctx.filters.from ?? format(startOfMonth(now), "yyyy-MM-dd");
  const defaultTo = ctx.filters.to ?? format(now, "yyyy-MM-dd");

  return (
    <ConsolidatedReportsClient
      defaultAsOf={defaultAsOf}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
