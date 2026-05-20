import { format, startOfMonth } from "date-fns";

import TaxReportClient from "@/components/accounting/reports/tax-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getTaxReportServer } from "@/lib/services/accounting.server";

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
    initialData = await getTaxReportServer(ctx, defaultFrom, defaultTo);
  } catch {
    /* client refetch */
  }

  return (
    <TaxReportClient
      initialData={initialData}
      serverPrefetched={initialData != null}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}
