import { requireServerPermission } from "@/lib/auth-server";

import Client from "./configuration-journals-client";

export default async function Page() {
  await requireServerPermission("manage_accounting_configuration");
  return <Client />;
}
