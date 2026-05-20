import ConsolidationRunsPage from "@/components/accounting/consolidation-runs/consolidation-runs-page";
import { loadReportPageContext } from "@/lib/server-page-props";
import {
  getConsolidationEntitiesServer,
  getConsolidationRunsServer,
} from "@/lib/services/accounting.server";
import type {
  ConsolidationEntityItem,
  ConsolidationRunItem,
} from "@/lib/services/accounting";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);
  const [entitiesRes, runsRes] = await Promise.all([
    getConsolidationEntitiesServer(ctx.tenantSlug),
    getConsolidationRunsServer(ctx, { limit: 50 }),
  ]);

  return (
    <ConsolidationRunsPage
      initialEntities={(entitiesRes.items ?? []) as ConsolidationEntityItem[]}
      initialRuns={(runsRes.items ?? []) as ConsolidationRunItem[]}
      serverPrefetched
    />
  );
}
