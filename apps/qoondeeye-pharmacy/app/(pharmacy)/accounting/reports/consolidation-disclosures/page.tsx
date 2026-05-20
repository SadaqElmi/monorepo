import ConsolidationDisclosuresPage from "@/components/accounting/consolidation-disclosures/consolidation-disclosures-page";
import { loadReportPageContext } from "@/lib/server-page-props";
import {
  getConsolidationEntitiesServer,
  getDisclosureConsolidationAdjustmentsServer,
  getDisclosureFxImpactServer,
  getDisclosureIntercompanyEliminationServer,
  getDisclosureNciServer,
} from "@/lib/services/accounting.server";
import type { ConsolidationEntityItem } from "@/lib/services/accounting";
import {
  periodFromDate,
  todayStr,
  type DisclosureTab,
} from "@/components/accounting/consolidation-disclosures/utils";

async function loadInitialPayload(
  ctx: Awaited<ReturnType<typeof loadReportPageContext>>,
  tab: DisclosureTab,
  periodKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (tab === "nci") return await getDisclosureNciServer(ctx, periodKey);
    if (tab === "fx") return await getDisclosureFxImpactServer(ctx, periodKey);
    if (tab === "adj") {
      return await getDisclosureConsolidationAdjustmentsServer(ctx, periodKey);
    }
    return await getDisclosureIntercompanyEliminationServer(ctx, periodKey);
  } catch {
    return null;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const asOfDefault = todayStr();
  const ctx = await loadReportPageContext(searchParams, { asOf: asOfDefault });
  const tab = (ctx.filters.tab as DisclosureTab | undefined) ?? "nci";
  const toDate = ctx.filters.asOf ?? asOfDefault;
  const periodKey = periodFromDate(toDate);

  const [entitiesRes, initialPayload] = await Promise.all([
    getConsolidationEntitiesServer(ctx.tenantSlug),
    loadInitialPayload(ctx, tab, periodKey),
  ]);

  return (
    <ConsolidationDisclosuresPage
      initialEntities={(entitiesRes.items ?? []) as ConsolidationEntityItem[]}
      initialPayload={initialPayload}
      initialTab={tab}
      initialToDate={toDate}
      initialEntityId={ctx.filters.entityId ?? ""}
      serverPrefetched
    />
  );
}
