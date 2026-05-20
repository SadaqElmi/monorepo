import { loadTenantListPage } from "@/lib/server-page-data";
import { getBatchesServer, getProductsServer } from "@/lib/services/api.server";

import Client from "./batches-client";

export default async function Page() {
  let initialBatches = null;
  let initialProducts = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({
      fetch: async (tenantSlug) => {
        const [batches, products] = await Promise.all([
          getBatchesServer(tenantSlug),
          getProductsServer(tenantSlug),
        ]);
        return { batches, products };
      },
    });
    initialBatches = data.batches;
    initialProducts = data.products;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialBatches={initialBatches}
      initialProducts={initialProducts}
      serverPrefetched={serverPrefetched}
    />
  );
}
