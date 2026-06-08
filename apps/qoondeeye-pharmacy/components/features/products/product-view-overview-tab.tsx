import type { Category, Product } from "@/lib/api";

export type ProductViewOverviewTabProps = {
  product: Product;
  categoryMap: Map<string, Category>;
};

export function ProductViewOverviewTab({
  product,
  categoryMap,
}: ProductViewOverviewTabProps) {
  const categoryName =
    (product.categoryId
      ? categoryMap.get(product.categoryId)?.name
      : undefined) ??
    product.category?.name ??
    "—";

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-muted-foreground">Name</div>
        <div className="text-sm font-semibold">{product.name}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Barcode/SKU
          </div>
          <div className="text-sm font-mono">{product.sku ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Category
          </div>
          <div className="text-sm">{categoryName}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Strength
          </div>
          <div className="text-sm">{product.strength ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Unit</div>
          <div className="text-sm">{product.unit ?? "—"}</div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">Form</div>
        <div className="text-sm">{product.formulation ?? "—"}</div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          Description
        </div>
        <div className="text-sm text-muted-foreground">
          {product.description ?? "—"}
        </div>
      </div>
    </div>
  );
}
