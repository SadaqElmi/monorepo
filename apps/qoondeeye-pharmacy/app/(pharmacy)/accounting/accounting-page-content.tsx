import { format } from "date-fns";

import { AccountingDashboard } from "@/components/accounting/accounting-dashboard";
import { loadReportPageContext } from "@/lib/server-page-props";
import {
  getAuditTrailServerSimple,
  getBalanceSheetServerSimple,
  getExecutiveSummaryServerSimple,
  getJournalEntriesServer,
} from "@/lib/services/api.server";

export default async function AccountingPageContent() {
  const ctx = await loadReportPageContext(Promise.resolve({}));
  const tenantSlug = ctx.tenantSlug;
  const asOf = format(new Date(), "yyyy-MM-dd");
  const from = format(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    "yyyy-MM-dd",
  );

  let initialBalanceSheet: Awaited<
    ReturnType<typeof getBalanceSheetServerSimple>
  > | null = null;
  let initialExecutive: Awaited<
    ReturnType<typeof getExecutiveSummaryServerSimple>
  > | null = null;
  let initialJournals: Awaited<ReturnType<typeof getJournalEntriesServer>> = [];
  let initialAudit: Awaited<ReturnType<typeof getAuditTrailServerSimple>> = [];

  try {
    const [bs, ex, journals, audit] = await Promise.all([
      getBalanceSheetServerSimple(
        tenantSlug,
        asOf,
        ctx.branchId,
        ctx.aggregateAll,
      ),
      getExecutiveSummaryServerSimple(
        tenantSlug,
        from,
        asOf,
        ctx.branchId,
        ctx.aggregateAll,
      ),
      ctx.branchId
        ? getJournalEntriesServer(tenantSlug, ctx.branchId, 8)
        : Promise.resolve([]),
      ctx.branchId
        ? getAuditTrailServerSimple(tenantSlug, ctx.branchId, 6).catch(() => [])
        : Promise.resolve([]),
    ]);
    initialBalanceSheet = bs;
    initialExecutive = ex;
    initialJournals = journals;
    initialAudit = audit;
  } catch {
    initialBalanceSheet = null;
    initialExecutive = null;
    initialJournals = [];
    initialAudit = [];
  }

  return (
    <AccountingDashboard
      tenantSlug={tenantSlug}
      serverScope={{ branchId: ctx.branchId, aggregateAll: ctx.aggregateAll }}
      initialBalanceSheet={initialBalanceSheet}
      initialJournals={initialJournals}
      initialExecutive={initialExecutive}
      initialAudit={initialAudit}
      serverPrefetched={Boolean(initialBalanceSheet || initialExecutive)}
      journalsPrefetched={Boolean(ctx.branchId)}
    />
  );
}
