import { requireSystemSession } from "@/lib/auth-server";

import Client from "./admin-staff-client";

export default async function Page() {
  await requireSystemSession();
  return <Client />;
}
