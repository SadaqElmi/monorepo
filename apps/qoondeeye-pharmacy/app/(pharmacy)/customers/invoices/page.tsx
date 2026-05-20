import CustomerInvoicesPage from "@/components/features/invoices/invoice-page";
import { requireServerSession } from "@/lib/auth-server";

export default async function Page() {
  await requireServerSession();
  return <CustomerInvoicesPage />;
}
