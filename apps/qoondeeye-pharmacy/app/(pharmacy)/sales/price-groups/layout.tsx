import { requireServerPermission } from "@/lib/auth-server";

export default async function PriceGroupsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServerPermission("manage_price_groups");
  return children;
}
