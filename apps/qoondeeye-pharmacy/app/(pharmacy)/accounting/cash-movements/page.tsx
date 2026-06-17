import { requireServerPermission } from "@/lib/auth-server";
import { CashMovementsClient } from "./cash-movements-client";

export default async function CashMovementsPage() {
  await requireServerPermission("view_pos_terminals");
  return <CashMovementsClient />;
}
