"use client";

import { Download, Loader2, Package, Plus, Search } from "lucide-react";

import type { Category, Product } from "@/lib/api";
import { CachedQueryToolbar } from "@/components/api/cached-query-toolbar";
import { ListPagination } from "@/components/api/list-pagination";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { ProductsTable } from "./products-table";

export type ProductsTableCardProps = {
  tenantSlug: string;
  loading: boolean;
  totalCount: number;
  showingCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  categoryTab: string;
  onCategoryTabChange: (value: string) => void;
  categories: Category[];
  filteredProducts: Product[];
  pagedProducts: Product[];
  categoryMap: Map<string, Category>;
  productStockMap: Map<string, number>;
  tablePage: number;
  tableTotalPages: number;
  onTablePageChange: (page: number) => void;
  dataUpdatedAt: number;
  isListFetching: boolean;
  onRefresh: () => void;
  onAddProduct: () => void;
  deletingId: string | null;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
};

export function ProductsTableCard({
  tenantSlug,
  loading,
  totalCount,
  showingCount,
  query,
  onQueryChange,
  categoryTab,
  onCategoryTabChange,
  categories,
  pagedProducts,
  categoryMap,
  productStockMap,
  tablePage,
  tableTotalPages,
  onTablePageChange,
  dataUpdatedAt,
  isListFetching,
  onRefresh,
  onAddProduct,
  deletingId,
  onView,
  onEdit,
  onDelete,
}: ProductsTableCardProps) {
  return (
    <Card className="overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Backed by{" "}
              <code className="font-mono text-xs">/api/products</code> with{" "}
              <code className="font-mono text-xs">X-Tenant</code>.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              {totalCount} product{totalCount === 1 ? "" : "s"}
            </div>
            <CachedQueryToolbar
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isListFetching}
              onRefresh={onRefresh}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search by name or barcode..."
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-1.5 rounded-xl">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              className="flex-1 gap-1.5 rounded-xl"
              onClick={onAddProduct}
              disabled={!tenantSlug}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {!tenantSlug ? (
          <p className="py-8 text-sm text-muted-foreground">
            Enter a tenant slug above to load products.
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading products…
          </div>
        ) : showingCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <p>No products yet.</p>
            <Button size="sm" className="mt-2" onClick={onAddProduct}>
              <Plus className="mr-1 h-4 w-4" />
              Add first product
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div className="flex items-center gap-2 overflow-x-auto">
                <ToggleGroup
                  type="single"
                  value={categoryTab}
                  onValueChange={(value) => {
                    if (value) onCategoryTabChange(value);
                  }}
                  spacing={8}
                  className="gap-2 rounded-none bg-transparent"
                >
                  <ToggleGroupItem
                    value="__all__"
                    className="whitespace-nowrap rounded-xl bg-muted/40 px-4 py-2 text-sm font-semibold text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary hover:bg-muted"
                  >
                    All Categories
                  </ToggleGroupItem>
                  {categories.slice(0, 8).map((c) => (
                    <ToggleGroupItem
                      key={c.id}
                      value={c.id}
                      className="whitespace-nowrap rounded-xl bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary hover:bg-muted"
                    >
                      {c.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <ProductsTable
              products={pagedProducts}
              categoryMap={categoryMap}
              productStockMap={productStockMap}
              deletingId={deletingId}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
            />

            <ListPagination
              className="border-t bg-muted/20 px-4 py-3"
              page={tablePage}
              totalPages={tableTotalPages}
              total={showingCount}
              onPageChange={onTablePageChange}
              disabled={loading}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
