import { requireServerSession } from "@/lib/auth-server";

import Client from "./admin-staff-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
