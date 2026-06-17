import { requireServerPermission } from "@/lib/auth-server";
import { PosDevicesClient } from "./pos-devices-client";

export default async function PosDevicesPage() {
  await requireServerPermission("view_pos_terminals");
  return <PosDevicesClient />;
}
