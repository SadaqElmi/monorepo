import { loadTenantListPage } from "@/lib/server-page-data";
import { getRolesServer } from "@/lib/services/api.server";

import Client from "./configuration-roles-client";

export default async function Page() {
  let initialRoles = null;
  let serverPrefetched = false;

  try {
    const { data } = await loadTenantListPage({ fetch: getRolesServer });
    initialRoles = data;
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client initialRoles={initialRoles} serverPrefetched={serverPrefetched} />
  );
}
