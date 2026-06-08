import type { Category, Product } from "@/lib/api";
import type { InventoryEntry } from "@/lib/services/inventory";

export type FormMode = "create" | "edit";

export type EditableProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  strength: string;
  formulation: string;
  unit: string;
  description: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: string;
};

export type FormUomDraft = {
  code: string;
  enabled: boolean;
  conversionFactorToBase: string;
  isBase: boolean;
  isPurchaseDefault: boolean;
  isSalesDefault: boolean;
  isPosDefault: boolean;
  sellingPrice: string;
};

export type ProductUomDraft = {
  uomId: string;
  conversionFactorToBase: string;
  isBase: boolean;
  isPurchaseDefault: boolean;
  isSalesDefault: boolean;
  isPosDefault: boolean;
  isActive: boolean;
  sellingPrice: string;
};

export const EMPTY_PRODUCT_UOM_DRAFT: ProductUomDraft = {
  uomId: "",
  conversionFactorToBase: "1",
  isBase: false,
  isPurchaseDefault: false,
  isSalesDefault: false,
  isPosDefault: false,
  isActive: true,
  sellingPrice: "",
};

export const TABLE_PAGE_SIZE = 25;

export type ProductsPageProps = {
  initialProducts?: Product[] | null;
  initialCategories?: Category[] | null;
  initialInventory?: InventoryEntry[] | null;
  serverPrefetched?: boolean;
};
