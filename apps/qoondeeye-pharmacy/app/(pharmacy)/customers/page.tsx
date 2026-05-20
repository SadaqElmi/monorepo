import { loadTenantListPage } from "@/lib/server-page-data";
import { getCustomersServer } from "@/lib/services/api.server";

import Client from "./customers-client";

export default async function Page() {
  let initialCustomers = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({ fetch: getCustomersServer });
    initialCustomers = data;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialCustomers={initialCustomers}
      serverPrefetched={serverPrefetched}
    />
  );
}
