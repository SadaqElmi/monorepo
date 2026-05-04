import type { PosCartLine } from "@repo/types";
import { POS_TAX_RATE } from "@repo/types";

/** Cart lines that count in tender and server sale (excludes member card until points). */
export function billableCartLines(lines: PosCartLine[]): PosCartLine[] {
  return lines.filter((l) => l.miscChargeKind !== "member_card");
}

export function cartTotals(lines: PosCartLine[], discount: number) {
  if (lines.length === 0) {
    return { subtotal: 0, tax: 0, total: 0 };
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = subtotal * POS_TAX_RATE;
  const total = Math.max(0, subtotal + tax - discount);
  return { subtotal, tax, total };
}

