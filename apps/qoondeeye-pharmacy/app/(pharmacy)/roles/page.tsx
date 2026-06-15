import { redirect } from "next/navigation";

import { requireServerPermission } from "@/lib/auth-server";

export default async function RolesAliasPage() {
  await requireServerPermission("manage_users");
  redirect("/users/roles");
}
