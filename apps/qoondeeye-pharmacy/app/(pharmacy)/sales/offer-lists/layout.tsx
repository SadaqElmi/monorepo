import { requireServerPermission } from "@/lib/auth-server";

export default async function OfferListsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServerPermission("manage_offers");
  return children;
}
