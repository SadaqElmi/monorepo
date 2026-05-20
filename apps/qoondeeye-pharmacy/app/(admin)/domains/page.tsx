import { requireServerSession } from "@/lib/auth-server";
import {
  getDomainsServer,
  getTenantsServer,
} from "@/lib/services/api.server";

import Client from "./domains-client";

export default async function Page() {
  await requireServerSession();

  let initialDomains = null;
  let initialTenants = null;
  let serverPrefetched = false;

  try {
    const [tenants, domains] = await Promise.all([
      getTenantsServer(),
      getDomainsServer(),
    ]);
    initialTenants = tenants;
    initialDomains = domains;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialDomains={initialDomains}
      initialTenants={initialTenants}
      serverPrefetched={serverPrefetched}
    />
  );
}
