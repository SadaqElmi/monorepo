import { requireSystemSession } from "@/lib/auth-server";

import Client from "./audit-logs-client";

export default async function Page() {
  await requireSystemSession();
  return <Client />;
}
