import { requireSystemSession } from "@/lib/auth-server";
import { getAllTenantsServer } from "@/lib/services/api.server";

import { TenantOwnersClient } from "@/app/(app)/tenant-owners/tenant-owners-client";

export default async function Page() {
  await requireSystemSession();

  let initialTenants = null;
  let serverPrefetched = false;

  try {
    initialTenants = await getAllTenantsServer();
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <TenantOwnersClient
      initialTenants={initialTenants}
      serverPrefetched={serverPrefetched}
    />
  );
}
