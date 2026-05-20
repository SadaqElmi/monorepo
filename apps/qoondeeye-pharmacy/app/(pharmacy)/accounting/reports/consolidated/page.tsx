import { format, startOfMonth } from "date-fns";

import ConsolidatedReportsClient from "@/components/accounting/reports/consolidated-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import {
  getBalanceSheetServer,
  getConsolidationPreviewServer,
  getIncomeStatementServer,
} from "@/lib/services/accounting.server";

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

  const consolidationMode = "posted" as const;

  let initialBs = null;
  let initialPnl = null;
  let initialPreview = null;
  if (ctx.aggregateAll) {
    try {
      const [bs, pnl, preview] = await Promise.all([
        getBalanceSheetServer(ctx, defaultAsOf, {
          consolidated: true,
          consolidationMode,
        }),
        getIncomeStatementServer(ctx, defaultFrom, defaultTo, {
          consolidationMode,
        }),
        getConsolidationPreviewServer(ctx, defaultAsOf),
      ]);
      initialBs = bs;
      initialPnl = pnl;
      initialPreview = preview;
    } catch {
      /* client refetch */
    }
  }

  const serverPrefetched =
    ctx.aggregateAll && initialBs != null && initialPnl != null;

  return (
    <ConsolidatedReportsClient
      initialBs={initialBs}
      initialPnl={initialPnl}
      initialPreview={initialPreview}
      serverPrefetched={serverPrefetched}
      defaultAsOf={defaultAsOf}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
