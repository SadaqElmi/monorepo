import { loadTenantListPage } from "@/lib/server-page-data";
import { getAccountsServer } from "@/lib/services/api.server";

import Client from "./chart-of-accounts-client";

export default async function Page() {
  let initialAccounts = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({ fetch: getAccountsServer });
    initialAccounts = data;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialAccounts={initialAccounts}
      serverPrefetched={serverPrefetched}
    />
  );
}
