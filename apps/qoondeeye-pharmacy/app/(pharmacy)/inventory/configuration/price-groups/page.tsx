import { redirect } from "next/navigation";

import { requireServerPermission } from "@/lib/auth-server";

export default async function PriceGroupsRedirectPage() {
  await requireServerPermission("manage_price_groups");
  redirect("/sales/price-groups");
}
