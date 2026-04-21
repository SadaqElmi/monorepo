import { StockTransferDetailContainer } from "@/components/features/stock-transfers/stock-transfer-detail-container";

export default async function StockTransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ transferId: string }>;
  searchParams: Promise<{ receiver?: string }>;
}) {
  const { transferId } = await params;
  const sp = await searchParams;
  const receiverView = sp.receiver === "1";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1 p-6 md:p-8">
        <StockTransferDetailContainer
          transferId={transferId}
          receiverView={receiverView}
        />
      </main>
    </div>
  );
}
