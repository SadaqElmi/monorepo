import { requireServerPermission } from "@/lib/auth-server";
import { PosSecurityClient } from "./pos-security-client";

export default async function PosSecurityPage() {
  await requireServerPermission("manage_pos_terminals");
  return <PosSecurityClient />;
}
