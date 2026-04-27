import type { PosCartLine } from "@repo/types";
import { TAX_RATE } from "./constants";

export function cartTotals(lines: PosCartLine[], discount: number) {
  if (lines.length === 0) {
    return { subtotal: 0, tax: 0, total: 0 };
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = Math.max(0, subtotal + tax - discount);
  return { subtotal, tax, total };
}

