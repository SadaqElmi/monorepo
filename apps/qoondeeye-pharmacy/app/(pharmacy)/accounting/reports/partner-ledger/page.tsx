import { format, startOfMonth } from "date-fns";

import PartnerLedgerReportClient from "@/components/accounting/reports/partner-ledger-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getPartnerLedgerServer } from "@/lib/services/accounting.server";

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
  const defaultPartnerKind: "customer" | "supplier" =
    ctx.filters.partnerKind === "supplier" ? "supplier" : "customer";
  const defaultPartnerId = ctx.filters.partnerId?.trim() ?? "";

  let initialLedger = null;
  if (
    defaultPartnerId &&
    (ctx.branchId != null || ctx.aggregateAll)
  ) {
    try {
      initialLedger = await getPartnerLedgerServer(
        ctx,
        defaultPartnerKind,
        defaultPartnerId,
        defaultFrom,
        defaultTo,
      );
    } catch {
      /* client refetch */
    }
  }

  return (
    <PartnerLedgerReportClient
      initialLedger={initialLedger}
      serverPrefetched={initialLedger != null}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
      defaultPartnerKind={defaultPartnerKind}
      defaultPartnerId={defaultPartnerId}
    />
  );
}
