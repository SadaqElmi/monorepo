import { requireServerPermission } from "@/lib/auth-server";
import { PosCenterClient } from "./pos-center-client";

export default async function PosCenterPage() {
  await requireServerPermission("view_pos_terminals");
  return <PosCenterClient />;
}
