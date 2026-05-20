import type { PosMiscChargeKind } from "@repo/types";
import {
  POS_MISC_CHARGE_LINE_LABELS,
  POS_PAYMENT_METHOD_LABELS,
  POS_TAX_RATE,
} from "@repo/types";
import { Activity, Pill } from "lucide-react";

import type { PosTransaction } from "@/components/pos/pos-transaction-receipt";
import type { Batch, Sale } from "@/lib/api";

import type { CartLine, Product } from "./pharmacy-pos-types";

export const POS_TRANSACTIONS_KEY = "pharmacare-pos-transactions";
export const POS_RECEIPT_SEQ_KEY = "pharmacare-pos-receipt-seq";

export function loadPosTransactions(): PosTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POS_TRANSACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PosTransaction[]) : [];
  } catch {
    return [];
  }
}

export function persistPosTransactions(rows: PosTransaction[]) {
  try {
    localStorage.setItem(POS_TRANSACTIONS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Keeps the next 5-digit ID above any already saved (handles old RCP-* ids and restores). */
export function syncReceiptSeqFromTransactions() {
  if (typeof window === "undefined") return;
  const txs = loadPosTransactions();
  let maxNum = 0;
  for (const t of txs) {
    if (/^\d{1,5}$/.test(t.receiptId)) {
      const n = Number.parseInt(t.receiptId, 10);
      if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
    }
  }
  const stored = Number.parseInt(
    localStorage.getItem(POS_RECEIPT_SEQ_KEY) ?? "0",
    10,
  );
  const fromStored = Number.isFinite(stored) && stored >= 1 ? stored : 1;
  const next = Math.max(maxNum + 1, fromStored);
  try {
    localStorage.setItem(POS_RECEIPT_SEQ_KEY, String(next));
  } catch {
    /* ignore */
  }
}

/** Next sale gets a zero-padded 5-digit transaction ID: 00001, 00002, … up to 99999. */
export function newReceiptId(): string {
  let n = Number.parseInt(localStorage.getItem(POS_RECEIPT_SEQ_KEY) ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) n = 1;
  const id = String(n).padStart(5, "0");
  try {
    localStorage.setItem(POS_RECEIPT_SEQ_KEY, String(n + 1));
  } catch {
    /* ignore */
  }
  return id;
}

export function priceForProduct(batches: Batch[], productId: string): number {
  const withStock = batches.filter(
    (b) => b.product_id === productId && (b.quantity ?? 0) > 0,
  );
  const prices = withStock
    .map((b) => Number(b.selling_price ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return 0;
  return Math.min(...prices);
}

export function listPriceFromProduct(p: {
  listPrice?: number | string | null;
}): number {
  const n = Number(p.listPrice ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

export function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function lineIconForProductId(productId: string) {
  let h = 0;
  for (let i = 0; i < productId.length; i++) {
    h = (h * 31 + productId.charCodeAt(i)) | 0;
  }
  return h % 2 === 0 ? Activity : Pill;
}

export function cartTotals(lines: CartLine[], discount: number) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = subtotal * POS_TAX_RATE;
  const total = subtotal + tax - discount;
  return { subtotal, tax, total };
}

export function billableCartLines(lines: CartLine[]): CartLine[] {
  return lines.filter((l) => l.miscChargeKind !== "member_card");
}

export function cloneLines(lines: CartLine[]): CartLine[] {
  return lines.map((l) => ({ ...l, lineId: crypto.randomUUID() }));
}

export function toFiniteNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePaymentMethod(v: unknown): string {
  if (typeof v !== "string") return "Sale";
  const key = v.trim();
  if (!key) return "Sale";
  return (
    POS_PAYMENT_METHOD_LABELS[key] ??
    POS_PAYMENT_METHOD_LABELS[key.toLowerCase()] ??
    key
  );
}

export function saleToPosTransaction(
  sale: Sale,
  productNameById?: Record<string, string>,
): PosTransaction {
  const rawLines = Array.isArray(sale.items) ? sale.items : [];
  const lines: PosTransaction["lines"] = rawLines.map((item, index) => {
    const qty = Math.max(1, Math.round(toFiniteNumber(item.quantity)));
    const unitPrice = toFiniteNumber(item.price);
    const miscKindRaw =
      typeof item.misc_charge_kind === "string"
        ? item.misc_charge_kind.trim()
        : "";
    const miscKind =
      miscKindRaw && miscKindRaw in POS_MISC_CHARGE_LINE_LABELS
        ? (miscKindRaw as PosMiscChargeKind)
        : null;
    const productId =
      (item.product_id ?? "").trim() ||
      (miscKind ? `misc-${miscKind}` : `item-${index + 1}`);
    const resolvedName =
      miscKind != null
        ? POS_MISC_CHARGE_LINE_LABELS[miscKind]
        : (productNameById && productNameById[productId]) || undefined;
    return {
      lineId: (item.id ?? "").trim() || `${sale.id}-${index + 1}`,
      productId,
      name: resolvedName ?? (item.product_id ? "Product" : "Item"),
      unitPrice,
      qty,
      unitType: "PC",
    };
  });

  const subtotalFromLines = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.qty,
    0,
  );
  const discount = toFiniteNumber(sale.discount);
  const tax = toFiniteNumber(sale.tax);
  const totalAmount = toFiniteNumber(sale.total_amount);
  const subtotal =
    subtotalFromLines > 0
      ? subtotalFromLines
      : Math.max(totalAmount + discount - tax, 0);
  const total =
    totalAmount > 0 ? totalAmount : Math.max(subtotal + tax - discount, 0);
  const createdAtParsed = sale.sale_date
    ? Date.parse(String(sale.sale_date))
    : Number.NaN;
  const createdAt = Number.isFinite(createdAtParsed) ? createdAtParsed : Date.now();
  const receiptId = (sale.receipt_number ?? "").trim() || sale.id;
  const paymentMethod = normalizePaymentMethod(sale.payment_method);

  return {
    receiptId,
    saleId: sale.id,
    createdAt,
    paymentMethod,
    lines,
    discount,
    subtotal,
    tax,
    total,
  };
}
