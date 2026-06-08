import type { PosCartLine } from "@repo/types";
import { POS_TAX_RATE } from "@repo/types";

/** Cart lines that count in tender and server sale (excludes member card until points). */
export function billableCartLines(lines: PosCartLine[]): PosCartLine[] {
  return lines.filter((l) => l.miscChargeKind !== "member_card");
}

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function lineDiscountForCartLine(line: PosCartLine): number {
  const gross = line.unitPrice * line.qty;
  if (gross <= 0) return 0;

  if (
    line.lineDiscount != null &&
    Number.isFinite(line.lineDiscount) &&
    line.lineDiscount > 0
  ) {
    return roundMoney(Math.min(line.lineDiscount, gross));
  }

  if (typeof line.lineDiscountPct === "number" && line.lineDiscountPct > 0) {
    return roundMoney((gross * line.lineDiscountPct) / 100);
  }

  return 0;
}

export function cartTotals(lines: PosCartLine[], discount: number) {
  if (lines.length === 0) {
    return { subtotal: 0, tax: 0, total: 0, lineDiscountTotal: 0 };
  }

  const subtotal = roundMoney(
    lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
  );
  const lineDiscountTotal = roundMoney(
    lines.reduce((sum, line) => sum + lineDiscountForCartLine(line), 0),
  );
  const orderDiscount = roundMoney(Math.max(0, discount));
  const tax = roundMoney(subtotal * POS_TAX_RATE);
  const total = Math.max(
    0,
    roundMoney(subtotal + tax - orderDiscount - lineDiscountTotal),
  );

  return { subtotal, tax, total, lineDiscountTotal };
}
