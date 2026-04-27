import type { UnitType } from "@repo/types";
import {
  Banknote,
  Gift,
  Landmark,
  Smartphone,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const POS_BRAND_COLOR = "#0d968b";

export const TAX_RATE = 0.05;
export const DEFAULT_DISCOUNT = 0;

export const ALL_CATEGORIES_LABEL = "All Categories";

export const UNIT_TYPES: UnitType[] = ["PC", "Box", "Ctn", "router"];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  evc: "EVC",
  edahab: "E-Dahab",
  "merchant-evc": "Merchant EVC",
  "merchant-edahab": "Merchant E-Dahab",
  banks: "Banks",
  "primary-wallet": "Primary Wallet",
  "member-points": "Member Points",
  voucher: "Voucher",
};

export type PaymentMethod = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "evc", label: "EVC", icon: Smartphone },
  { id: "edahab", label: "E-Dahab", icon: Smartphone },
  { id: "merchant-evc", label: "Merchant EVC", icon: Smartphone },
  { id: "merchant-edahab", label: "Merchant E-Dahab", icon: Smartphone },
  { id: "banks", label: "Banks", icon: Landmark },
  { id: "primary-wallet", label: "Primary Wallet", icon: Wallet },
  { id: "member-points", label: "Member Points", icon: Star },
  { id: "My Cash", label: "My Cash", icon: Gift },
  { id: "Ebesa", label: "Ebesa", icon: Gift },
  { id: "My Bank", label: "My Bank", icon: Gift },
  { id: "T-plus", label: "T-plus", icon: Gift },
  { id: "Yeel App", label: "Yeel App", icon: Gift },
  { id: "Refund", label: "Refund", icon: Gift },
];
