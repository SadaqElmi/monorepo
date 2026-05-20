import { loadTenantListPage } from "@/lib/server-page-data";
import { getSuppliersServer } from "@/lib/services/api.server";

import Client from "./suppliers-client";

export default async function Page() {
  let initialSuppliers = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({ fetch: getSuppliersServer });
    initialSuppliers = data;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialSuppliers={initialSuppliers}
      serverPrefetched={serverPrefetched}
    />
  );
}
