import { requireServerPermission } from "@/lib/auth-server";

import PosApprovalsClient from "@/app/(pharmacy)/operations/pos-approvals/pos-approvals-client";

export default async function PosApprovalsPage() {
  await requireServerPermission("view_pos_terminals");
  return <PosApprovalsClient />;
}
