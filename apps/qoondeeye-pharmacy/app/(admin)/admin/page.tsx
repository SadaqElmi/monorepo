import { requireServerSession } from "@/lib/auth-server";
import {
  getDomainsServer,
  getSystemUsersServer,
  getTenantsServer,
} from "@/lib/services/api.server";

import Client from "./admin-dashboard-client";

export default async function Page() {
  await requireServerSession();

  let initialDashboard = null;
  let serverPrefetched = false;

  try {
    const [tenants, domains, systemUsers] = await Promise.all([
      getTenantsServer(),
      getDomainsServer(),
      getSystemUsersServer(),
    ]);
    initialDashboard = {
      tenants,
      domains,
      systemUsers,
      lastUpdatedAt: new Date().toISOString(),
    };
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client
      initialDashboard={initialDashboard}
      serverPrefetched={serverPrefetched}
    />
  );
}
