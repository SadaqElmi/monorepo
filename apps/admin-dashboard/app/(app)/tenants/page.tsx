import { requireSystemSession } from "@/lib/auth-server";
import { getTenantsServer } from "@/lib/services/api.server";

import Client from "./tenants-client";

export default async function Page() {
  await requireSystemSession();

  let initialTenants = null;
  let serverPrefetched = false;

  try {
    initialTenants = await getTenantsServer();
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialTenants={initialTenants}
      serverPrefetched={serverPrefetched}
    />
  );
}
