import { requireServerPermission } from "@/lib/auth-server";

import Client from "./payment-terms-client";

export default async function Page() {
  await requireServerPermission("manage_accounting_configuration");
  return <Client />;
}
