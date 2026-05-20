import InterbranchMismatchesClient from "@/components/accounting/reports/interbranch-mismatches-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import type { InterbranchMismatchItem } from "@/lib/services/accounting";
import { getInterbranchMismatchesServer } from "@/lib/services/accounting.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);

  let initialItems: InterbranchMismatchItem[] | null = null;
  if (ctx.aggregateAll) {
    try {
      const res = await getInterbranchMismatchesServer(ctx);
      initialItems = res.items ?? [];
    } catch {
      /* client refetch */
    }
  }

  return (
    <InterbranchMismatchesClient
      initialItems={initialItems}
      serverPrefetched={initialItems != null}
    />
  );
}
