import { loadTenantListPage } from "@/lib/server-page-data";
import { getCategoriesServer } from "@/lib/services/api.server";

import Client from "./categories-client";

export default async function Page() {
  let initialCategories = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({ fetch: getCategoriesServer });
    initialCategories = data;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialCategories={initialCategories}
      serverPrefetched={serverPrefetched}
    />
  );
}
