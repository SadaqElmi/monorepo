import CustomerDetailClient from "./customer-detail-client";

export default async function Page({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetailClient customerId={customerId} />;
}
