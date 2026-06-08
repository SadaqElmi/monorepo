import { PurchaseDocumentClient } from "@/components/features/bills/purchase-document-client";
import { requireServerSession } from "@/lib/auth-server";

export default async function NewPurchasePage() {
  await requireServerSession();
  return <PurchaseDocumentClient mode="new" />;
}
