import { requireServerPermission } from "@/lib/auth-server";

import PosAuditClient from "./pos-audit-client";

export default async function PosAuditPage() {
  await requireServerPermission("view_pos_terminals");
  return <PosAuditClient />;
}
