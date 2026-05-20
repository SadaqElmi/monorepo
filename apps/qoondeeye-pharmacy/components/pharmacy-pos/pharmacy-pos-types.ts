import type { PosMiscChargeKind } from "@repo/types";

export type UnitType = "PC" | "Box" | "Ctn" | "router";

export type Product = {
  id: string;
  sku: string;
  name: string;
  meta: string;
  category: string;
  /** Formatted selling unit price (batch selling, or list fallback). */
  price: string;
  /** Unit price charged at the register (selling from stock, else list). */
  priceValue: number;
  /** Catalog list price when higher than selling — shown struck-through in grid. */
  listPriceValue?: number;
  showCompare?: boolean;
  stock: "in" | "low";
  unitType: UnitType;
};

export type CartLine = {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  /** List price per unit when shown above selling (for receipt & cart). */
  listUnitPrice?: number;
  qty: number;
  unitType: UnitType;
  /** Manual charge (delivery/tailor); member_card excluded from billable totals until points. */
  miscChargeKind?: PosMiscChargeKind;
};

export type HeldOrder = {
  id: string;
  label: string;
  createdAt: number;
  lines: CartLine[];
};
