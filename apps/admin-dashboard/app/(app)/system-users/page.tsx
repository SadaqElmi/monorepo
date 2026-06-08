import { requireSystemSession } from "@/lib/auth-server";
import { getSystemUsersServer } from "@/lib/services/api.server";

import Client from "./system-users-client";

export default async function Page() {
  await requireSystemSession();

  let initialUsers = null;
  let serverPrefetched = false;

  try {
    initialUsers = await getSystemUsersServer();
    serverPrefetched = true;
  } catch {
    /* client refetch */
  }

  return (
    <Client initialUsers={initialUsers} serverPrefetched={serverPrefetched} />
  );
}
