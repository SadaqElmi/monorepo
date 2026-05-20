import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";

import { StockTransferDetailContainer } from "@/components/features/stock-transfers/stock-transfer-detail-container";
import { getQueryClient } from "@/lib/get-query-client";
import { getServerBranchQueryKeyFacet } from "@/lib/query-branch-key.server";
import { getTransferDetailPrefetchContext } from "@/lib/services/transfers-detail.server";
import { transferDetailQueryKey } from "@/lib/transfers-query-keys";

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

  let ctx: Awaited<ReturnType<typeof getTransferDetailPrefetchContext>>;
  try {
    ctx = await getTransferDetailPrefetchContext(transferId);
  } catch {
    notFound();
  }

  const branchFacet = getServerBranchQueryKeyFacet(ctx.scope);
  const queryKey = transferDetailQueryKey(
    ctx.tenantSlug,
    transferId,
    branchFacet,
  );

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey,
    queryFn: () => ctx.bundle,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1 p-6 md:p-8">
        <HydrationBoundary state={dehydrate(queryClient)}>
          <StockTransferDetailContainer
            transferId={transferId}
            receiverView={receiverView}
            tenantSlug={ctx.tenantSlug}
            initialBranchFacet={branchFacet}
          />
        </HydrationBoundary>
      </main>
    </div>
  );
}
