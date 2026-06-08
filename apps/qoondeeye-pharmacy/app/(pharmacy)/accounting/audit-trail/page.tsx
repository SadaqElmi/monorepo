import { requireServerPermission } from "@/lib/auth-server";

import Client from "./audit-trail-client";

export default async function Page() {
  await requireServerPermission("view_audit_logs");
  return <Client />;
}
