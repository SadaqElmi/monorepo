import { redirect } from "next/navigation";

import { requireServerPermission } from "@/lib/auth-server";

export default async function PricingManagementRedirectPage() {
  await requireServerPermission("manage_pricing");
  redirect("/sales/pricing-management");
}
