import type { PosCatalogData } from "@/lib/pos-catalog-view";
import { getOfflineDb } from "./db";

export async function saveCatalogSnapshot(
  tenantSlug: string,
  facet: string,
  data: PosCatalogData,
) {
  const db = await getOfflineDb();
  await db.put("catalog", {
    key: `${tenantSlug}:${facet}`,
    tenantSlug,
    facet,
    data,
    cachedAt: Date.now(),
  });
}

export async function loadCatalogSnapshot(
  tenantSlug: string,
  facet: string,
): Promise<PosCatalogData | null> {
  const db = await getOfflineDb();
  const row = await db.get("catalog", `${tenantSlug}:${facet}`);
  return row?.data ?? null;
}

/** Optimistic offline stock decrement after a queued sale. */
export async function decrementCatalogStock(
  tenantSlug: string,
  facet: string,
  items: Array<{ productId: string; batchId?: string | null; quantity: number }>,
) {
  const data = await loadCatalogSnapshot(tenantSlug, facet);
  if (!data?.batchesData?.length) return;

  const nextBatches = data.batchesData.map((batch) => {
    const match = items.find(
      (item) =>
        item.productId === batch.productId &&
        (!item.batchId || item.batchId === batch.id),
    );
    if (!match) return batch;
    const qty = Number(batch.quantity ?? 0);
    return {
      ...batch,
      quantity: Math.max(0, qty - match.quantity),
    };
  });

  await saveCatalogSnapshot(tenantSlug, facet, {
    ...data,
    batchesData: nextBatches,
  });
}
