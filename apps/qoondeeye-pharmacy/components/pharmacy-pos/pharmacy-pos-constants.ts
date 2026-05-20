import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Gift,
  Landmark,
  Smartphone,
  Star,
  Wallet,
} from "lucide-react";

import {
  POS_PAYMENT_METHOD_IDS,
  POS_PAYMENT_METHOD_LABELS,
} from "@repo/types";

import type { UnitType } from "./pharmacy-pos-types";

export const brand = "#0d968b";

export const ALL_CATEGORIES_LABEL = "All Categories";

export const UNIT_CYCLE: UnitType[] = ["PC", "Box", "Ctn", "router"];

export function nextUnitType(cur: UnitType): UnitType {
  const idx = UNIT_CYCLE.indexOf(cur);
  const next = idx === -1 ? 0 : (idx + 1) % UNIT_CYCLE.length;
  return UNIT_CYCLE[next];
}

const POS_PAYMENT_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  evc: Smartphone,
  edahab: Smartphone,
  "merchant-evc": Smartphone,
  "merchant-edahab": Smartphone,
  banks: Landmark,
  "primary-wallet": Wallet,
  "member-points": Star,
  "My Cash": Gift,
  Ebesa: Gift,
  "My Bank": Gift,
  "T-plus": Gift,
  "Yeel App": Gift,
  Refund: Gift,
};

export const PAYMENT_METHODS = POS_PAYMENT_METHOD_IDS.map((id) => ({
  id,
  label: POS_PAYMENT_METHOD_LABELS[id] ?? id,
  icon: POS_PAYMENT_ICONS[id] ?? Banknote,
}));
