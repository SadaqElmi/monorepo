import { loadTenantListPage } from "@/lib/server-page-data";
import {
  getCategoriesServer,
  getInventoryServer,
  getProductsCatalogServer,
} from "@/lib/services/api.server";

import Client from "./products-client";

export default async function Page() {
  let initialProducts = null;
  let initialCategories = null;
  let initialInventory = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({
      fetch: async (tenantSlug) => {
        const [products, categories, inventory] = await Promise.all([
          getProductsCatalogServer(tenantSlug),
          getCategoriesServer(tenantSlug),
          getInventoryServer(tenantSlug),
        ]);
        return { products, categories, inventory };
      },
    });
    initialProducts = data.products;
    initialCategories = data.categories;
    initialInventory = data.inventory;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialProducts={initialProducts}
      initialCategories={initialCategories}
      initialInventory={initialInventory}
      serverPrefetched={serverPrefetched}
    />
  );
}
