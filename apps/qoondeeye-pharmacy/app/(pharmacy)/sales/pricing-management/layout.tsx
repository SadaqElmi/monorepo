import { requireServerPermission } from "@/lib/auth-server";

export default async function PricingManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServerPermission("manage_pricing");
  return children;
}
