import type { UnitType } from "@repo/types";
import type { ProductUom } from "@repo/types";

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
  uomId?: string;
  uomCode?: string;
  uomSymbol?: string | null;
  conversionFactorToBase?: number;
  priceGroupId?: string;
  offerId?: string;
  discountSource?: string;
  uoms?: ProductUom[];
};

