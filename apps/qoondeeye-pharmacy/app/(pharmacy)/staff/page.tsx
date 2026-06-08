import { redirect } from "next/navigation";

import { requireServerPermission } from "@/lib/auth-server";

export default async function StaffAliasPage() {
  await requireServerPermission("manage_users");
  redirect("/configuration/staff");
}
