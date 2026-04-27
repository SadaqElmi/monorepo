import type { PosTransaction } from "@repo/types";

export const POS_TRANSACTIONS_KEY = "pharmacare-pos-transactions";
export const POS_RECEIPT_SEQ_KEY = "pharmacare-pos-receipt-seq";
export const POS_HELD_ORDERS_KEY = "pharmacare-pos-held-orders";

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

import type { PosHeldOrder } from "@repo/types";

export function loadHeldOrders(): PosHeldOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POS_HELD_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PosHeldOrder[]) : [];
  } catch {
    return [];
  }
}

export function persistHeldOrders(orders: PosHeldOrder[]) {
  try {
    localStorage.setItem(POS_HELD_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    /* ignore */
  }
}

import type { PosCartLine } from "@repo/types";

export function cloneLines(lines: PosCartLine[]): PosCartLine[] {
  return lines.map((l) => ({ ...l, lineId: crypto.randomUUID() }));
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
