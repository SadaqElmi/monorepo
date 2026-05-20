import { format, startOfMonth } from "date-fns";

import CashFlowReportClient from "@/components/accounting/reports/cash-flow-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getCashFlowStatementServer } from "@/lib/services/accounting.server";

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
  const compareFrom = ctx.filters.compareFrom?.trim() || undefined;
  const compareTo = ctx.filters.compareTo?.trim() || undefined;

  let initialData = null;
  try {
    initialData = await getCashFlowStatementServer(ctx, defaultFrom, defaultTo, {
      compareFrom,
      compareTo,
    });
  } catch {
    /* client refetch */
  }

  return (
    <CashFlowReportClient
      initialData={initialData}
      serverPrefetched={initialData != null}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
