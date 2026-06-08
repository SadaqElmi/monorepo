import { requireServerPermission } from "@/lib/auth-server";

export default async function AccountingConfigurationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServerPermission("manage_accounting_configuration");
  return children;
}
