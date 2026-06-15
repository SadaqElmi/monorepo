import type { PosMiscChargeKind, UnitType } from "@repo/types";
import { POS_MISC_CHARGE_LINE_LABELS } from "@repo/types";
import type { PosTransaction } from "@/components/pos/pos-transaction-receipt";
import type { Sale } from "@/lib/api";
import { PAYMENT_METHOD_LABELS } from "./constants";

function toFiniteNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizePaymentMethod(v: unknown): string {
  if (typeof v !== "string") return "Sale";
  const key = v.trim();
  if (!key) return "Sale";
  return PAYMENT_METHOD_LABELS[key.toLowerCase()] ?? key;
}

export function saleToPosTransaction(
  sale: Sale,
  productNameById?: Record<string, string>,
): PosTransaction {
  const rawLines = Array.isArray(sale.items) ? sale.items : [];
  const lines = rawLines.map((item, index) => {
    const qty = Math.max(1, Math.round(toFiniteNumber(item.quantity)));
    const unitPrice = toFiniteNumber(item.price);
    const miscKindRaw =
      typeof item.misc_charge_kind === "string"
        ? item.misc_charge_kind.trim()
        : "";
    const miscKind =
      miscKindRaw &&
      miscKindRaw in POS_MISC_CHARGE_LINE_LABELS
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
      name:
        resolvedName ?? (item.product_id ? "Product" : "Item"),
      unitPrice,
      qty,
      unitType: "PC" as UnitType,
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
  const createdAtParsed = sale.sale_date ? Date.parse(String(sale.sale_date)) : Number.NaN;
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
    storeNo: sale.store_no?.trim() || null,
    terminalNo: sale.terminal_no?.trim() || null,
  };
}

