import SupplierDetailClient from "./supplier-detail-client";

export default async function Page({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  return <SupplierDetailClient supplierId={supplierId} />;
}
