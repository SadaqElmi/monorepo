import { loadTenantListPage } from "@/lib/server-page-data";
import { getBranchesServer, getInventoryServer } from "@/lib/services/api.server";

import Client from "./branches-client";

export default async function Page() {
  let initialBranches = null;
  let initialInventory = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({
      fetch: async (tenantSlug) => {
        const [branches, inventory] = await Promise.all([
          getBranchesServer(tenantSlug),
          getInventoryServer(tenantSlug),
        ]);
        return { branches, inventory };
      },
    });
    initialBranches = data.branches;
    initialInventory = data.inventory;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialBranches={initialBranches}
      initialInventory={initialInventory}
      serverPrefetched={serverPrefetched}
    />
  );
}
