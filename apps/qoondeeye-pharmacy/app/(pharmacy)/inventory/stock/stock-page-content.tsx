import { loadTenantListPage } from "@/lib/server-page-data";
import {
  getBranchesServer,
  getInventoryServer,
  getProductsServer,
} from "@/lib/services/api.server";

import Client from "./stock-client";

export default async function StockPageContent() {
  let initialInventory = null;
  let initialProducts = null;
  let initialBranches = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({
      fetch: async (tenantSlug) => {
        const [inventory, products, branches] = await Promise.all([
          getInventoryServer(tenantSlug),
          getProductsServer(tenantSlug),
          getBranchesServer(tenantSlug),
        ]);
        return { inventory, products, branches };
      },
    });
    initialInventory = data.inventory;
    initialProducts = data.products;
    initialBranches = data.branches;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialInventory={initialInventory}
      initialProducts={initialProducts}
      initialBranches={initialBranches}
      serverPrefetched={serverPrefetched}
    />
  );
}
