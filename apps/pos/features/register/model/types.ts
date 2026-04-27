import type { UnitType } from "@repo/types";

export type PosCatalogProduct = {
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

