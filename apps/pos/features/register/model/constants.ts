import type { UnitType } from "@repo/types";
import {
  POS_DEFAULT_DISCOUNT,
  POS_PAYMENT_METHOD_LABELS,
  POS_TAX_RATE,
} from "@repo/types";
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

export const TAX_RATE = POS_TAX_RATE;
export const DEFAULT_DISCOUNT = POS_DEFAULT_DISCOUNT;

export const ALL_CATEGORIES_LABEL = "All Categories";

export const UNIT_TYPES: UnitType[] = ["PC", "Box", "Ctn", "router"];

export const PAYMENT_METHOD_LABELS = POS_PAYMENT_METHOD_LABELS;

/** Only cash may accept over-tender (change shown as "Charge" on the receipt). */
export const CASH_PAYMENT_METHOD_ID = "cash";

export const CUSTOMER_CREDIT_PAYMENT_METHOD_ID = "customer-credit";

export function isCashPaymentMethod(codeOrLabel: string): boolean {
  const raw = codeOrLabel.trim();
  if (!raw) return false;
  if (raw.toLowerCase() === CASH_PAYMENT_METHOD_ID) return true;
  return raw === PAYMENT_METHOD_LABELS[CASH_PAYMENT_METHOD_ID];
}

export type PaymentMethod = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cash", label: PAYMENT_METHOD_LABELS.cash, icon: Banknote },
  { id: "evc", label: PAYMENT_METHOD_LABELS.evc, icon: Smartphone },
  { id: "edahab", label: PAYMENT_METHOD_LABELS.edahab, icon: Smartphone },
  {
    id: "merchant-evc",
    label: PAYMENT_METHOD_LABELS["merchant-evc"],
    icon: Smartphone,
  },
  {
    id: "merchant-edahab",
    label: PAYMENT_METHOD_LABELS["merchant-edahab"],
    icon: Smartphone,
  },
  { id: "banks", label: PAYMENT_METHOD_LABELS.banks, icon: Landmark },
  {
    id: "primary-wallet",
    label: PAYMENT_METHOD_LABELS["primary-wallet"],
    icon: Wallet,
  },
  {
    id: "member-points",
    label: PAYMENT_METHOD_LABELS["member-points"],
    icon: Star,
  },
  { id: "My Cash", label: PAYMENT_METHOD_LABELS["My Cash"], icon: Gift },
  { id: "Ebesa", label: PAYMENT_METHOD_LABELS.Ebesa, icon: Gift },
  { id: "My Bank", label: PAYMENT_METHOD_LABELS["My Bank"], icon: Gift },
  { id: "T-plus", label: PAYMENT_METHOD_LABELS["T-plus"], icon: Gift },
  { id: "Yeel App", label: PAYMENT_METHOD_LABELS["Yeel App"], icon: Gift },
  { id: "Refund", label: PAYMENT_METHOD_LABELS.Refund, icon: Gift },
];
