import { loadTenantListPage } from "@/lib/server-page-data";
import { getChartOfAccountsServer } from "@/lib/services/api.server";

import Client from "./chart-of-accounts-client";

export default async function Page() {
  let initialCoa = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({ fetch: getChartOfAccountsServer });
    initialCoa = data;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client initialCoa={initialCoa} serverPrefetched={serverPrefetched} />
  );
}
