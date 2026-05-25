import type { Category, Product } from "@repo/types";
import type { UnitType } from "@repo/types";

import { ALL_CATEGORIES_LABEL } from "@/features/register/model/constants";
import { resolvePosCatalogPricing } from "@/features/register/model/pricing";
import type { PosCatalogProduct } from "@/features/register/model/types";
import type { Batch } from "@/lib/api";
import { formatMoney } from "@/shared/lib";

export type PosCatalogData = {
  prods: Product[];
  batchesData: Batch[];
  cats: Category[];
};

export type PosCatalogView = {
  catalogProducts: PosCatalogProduct[];
  categoryList: string[];
  batches: PosCatalogData["batchesData"];
  productNameById: Record<string, string>;
  barcodeToProductId: Record<string, string>;
};

export const EMPTY_POS_CATALOG_VIEW: PosCatalogView = {
  catalogProducts: [],
  categoryList: [ALL_CATEGORIES_LABEL],
  batches: [],
  productNameById: {},
  barcodeToProductId: {},
};

export function mapPosCatalogView(raw: PosCatalogData): PosCatalogView {
  const { prods, batchesData, cats } = raw;
  const catNames = new Map(cats.map((c) => [c.id, c.name]));
  const productNameById: Record<string, string> = {};
  const barcodeToProductId: Record<string, string> = {};

  const catalogProducts: PosCatalogProduct[] = prods.map((p) => {
    const { sellingValue, listValue, showCompare } = resolvePosCatalogPricing(
      p,
      batchesData,
      p.id,
    );
    productNameById[p.id] = p.name;
    const code = (p.sku ?? "").trim().toLowerCase();
    if (code) barcodeToProductId[code] = p.id;

    return {
      id: p.id,
      sku: (p.sku ?? "").trim() || p.id.slice(0, 8),
      name: p.name,
      meta:
        [p.genericName, p.strength, p.unit].filter(Boolean).join(" • ") ||
        "Catalog item",
      category:
        (p.categoryId && catNames.get(p.categoryId)) || "Uncategorized",
      price: formatMoney(sellingValue),
      priceValue: sellingValue,
      listPriceValue: showCompare ? listValue : undefined,
      showCompare,
      stock: "in" as const,
      unitType: "PC" as UnitType,
    };
  });

  const categoryList =
    catalogProducts.length > 0
      ? [
          ALL_CATEGORIES_LABEL,
          ...[...new Set(catalogProducts.map((m) => m.category))].sort(),
        ]
      : [ALL_CATEGORIES_LABEL];

  return {
    catalogProducts,
    categoryList,
    batches: batchesData,
    productNameById,
    barcodeToProductId,
  };
}
