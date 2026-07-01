import { loadReportPageContext } from "@/lib/server-page-props";
import { getJournalEntriesServer } from "@/lib/services/api.server";

import JournalsClient from "./journals-client";

export default async function JournalsPageContent() {
  const ctx = await loadReportPageContext(Promise.resolve({}));
  const tenantSlug = ctx.tenantSlug;

  let initialJournals: Awaited<ReturnType<typeof getJournalEntriesServer>> = [];

  try {
    initialJournals = ctx.branchId
      ? await getJournalEntriesServer(tenantSlug, ctx.branchId, 80)
      : [];
  } catch {
    initialJournals = [];
  }

  return (
    <JournalsClient
      tenantSlug={tenantSlug}
      serverScope={{ branchId: ctx.branchId }}
      initialJournals={initialJournals}
      serverPrefetched={Boolean(ctx.branchId)}
    />
  );
}
