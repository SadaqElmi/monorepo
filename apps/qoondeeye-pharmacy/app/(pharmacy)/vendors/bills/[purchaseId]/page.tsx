import { PurchaseDocumentClient } from "@/components/features/bills/purchase-document-client";
import { requireServerSession } from "@/lib/auth-server";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  await requireServerSession();
  const { purchaseId } = await params;
  return <PurchaseDocumentClient mode="view" purchaseId={purchaseId} />;
}
