import { requireServerPermission } from "@/lib/auth-server";

import Client from "./configuration-staff-client";

export default async function Page() {
  await requireServerPermission("view_staff");
  return <Client />;
}
