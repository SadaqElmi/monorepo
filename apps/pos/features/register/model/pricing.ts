import type { Batch } from "@/lib/api";

function listPriceFromProduct(p: { listPrice?: number | string | null }): number {
  const n = Number(p.listPrice ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function priceForProduct(batches: Batch[], productId: string): number {
  const withStock = batches.filter(
    (b) => b.product_id === productId && (b.quantity ?? 0) > 0,
  );
  const prices = withStock
    .map((b) => Number(b.selling_price ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return 0;
  return Math.min(...prices);
}

/** Batch selling price first; fallback to catalog list price. Compare-at when list exceeds selling. */
export function resolvePosCatalogPricing(
  p: { listPrice?: number | string | null },
  batches: Batch[],
  productId: string,
): {
  sellingValue: number;
  listValue: number;
  showCompare: boolean;
} {
  const listValue = listPriceFromProduct(p);
  const fromBatches = priceForProduct(batches, productId);
  const sellingValue =
    fromBatches > 0 ? fromBatches : listValue > 0 ? listValue : 0;
  const showCompare =
    listValue > 0 &&
    sellingValue > 0 &&
    Math.round(listValue * 100) > Math.round(sellingValue * 100);
  return { sellingValue, listValue, showCompare };
}

