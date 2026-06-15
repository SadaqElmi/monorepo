import { requireSystemSession } from "@/lib/auth-server";
import { getTenantsServer } from "@/lib/services/api.server";

import Client from "./tenants-client";

export default async function Page() {
  await requireSystemSession();

  let initialData = null;
  let serverPrefetched = false;

  try {
    initialData = await getTenantsServer();
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialData={initialData}
      serverPrefetched={serverPrefetched}
    />
  );
}
