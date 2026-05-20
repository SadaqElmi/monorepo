"use client";

import { Package, QrCode, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { ALL_CATEGORIES_LABEL, brand } from "./pharmacy-pos-constants";
import type { Product } from "./pharmacy-pos-types";
import { formatMoney } from "./pharmacy-pos-utils";

function StockBadge({ stock }: { stock: Product["stock"] }) {
  if (stock === "in") {
    return <Badge variant="success">In Stock</Badge>;
  }
  return (
    <Badge
      variant="secondary"
      className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    >
      Low Stock
    </Badge>
  );
}

type PosRegisterCatalogProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchEnter: () => void;
  categoryList: string[];
  activeCategory: string;
  onSelectCategory: (cat: string) => void;
  filteredProducts: Product[];
  onAddProduct: (p: Product) => void;
};

export function PosRegisterCatalog({
  searchQuery,
  onSearchChange,
  onSearchEnter,
  categoryList,
  activeCategory,
  onSelectCategory,
  filteredProducts,
  onAddProduct,
}: PosRegisterCatalogProps) {
  return (
    <>
      <Card className="shrink-0 gap-4 border-[color:var(--pos-brand)]/10 py-6 dark:bg-slate-900/40">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[color:var(--pos-brand)]/60"
                aria-hidden
              />
              <Input
                id="pos-barcode-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearchEnter();
                  }
                }}
                placeholder="Search by name or Number barcode"
                autoComplete="off"
                autoFocus
                className="h-11 rounded-xl border-0 bg-[color:var(--pos-brand)]/5 pl-12 pr-4 text-sm focus-visible:ring-[color:var(--pos-brand)]/50"
              />
            </div>
            <Button
              type="button"
              className="h-11 gap-2 rounded-xl px-6 font-bold text-primary-foreground shadow-none"
              style={{ backgroundColor: brand }}
              onClick={() =>
                document.getElementById("pos-barcode-search")?.focus()
              }
            >
              <QrCode className="size-5" />
              Scan
            </Button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
            {categoryList.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <Button
                  key={cat}
                  type="button"
                  variant={isActive ? "default" : "secondary"}
                  size="sm"
                  onClick={() => onSelectCategory(cat)}
                  className={cn(
                    "shrink-0 rounded-full text-xs font-semibold",
                    isActive &&
                      "text-primary-foreground shadow-none hover:opacity-90",
                    isActive &&
                      "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
                    !isActive &&
                      "bg-[color:var(--pos-brand)]/10 text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/20",
                  )}
                >
                  {cat}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-[color:var(--pos-brand)]/20 bg-[color:var(--pos-brand)]/[0.03] px-4 py-12 text-center text-sm text-muted-foreground">
            No products match this category or search. Try another filter or
            clear the search box.
          </div>
        ) : (
          filteredProducts.map((p) => (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onAddProduct(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAddProduct(p);
                }
              }}
              className="group cursor-pointer gap-0 border-[color:var(--pos-brand)]/5 py-0 ring-1 transition-all hover:border-[color:var(--pos-brand)]/40 dark:bg-slate-900/40"
            >
              <CardContent className="flex gap-2 px-3 py-2">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--pos-brand)]/10 transition-colors group-hover:bg-[color:var(--pos-brand)]/15">
                  <Package
                    className="size-6 text-[color:var(--pos-brand)]/70"
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    {p.sku}
                  </p>
                  <h4 className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                    {p.name}
                  </h4>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {p.meta}
                  </p>
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 text-left">
                      {p.showCompare &&
                      p.listPriceValue != null &&
                      p.listPriceValue > p.priceValue ? (
                        <div className="flex flex-col gap-0 leading-tight">
                          <span
                            className="text-[10px] tabular-nums text-muted-foreground line-through"
                            aria-label={`List price ${formatMoney(p.listPriceValue)}`}
                          >
                            {formatMoney(p.listPriceValue)}
                          </span>
                          <span
                            className="font-bold tabular-nums text-[12px]"
                            style={{ color: brand }}
                            aria-label={`Selling price ${p.price}`}
                          >
                            {p.price}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="font-bold tabular-nums text-[12px]"
                          style={{ color: brand }}
                        >
                          {p.price}
                        </span>
                      )}
                    </div>
                    <StockBadge stock={p.stock} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

export { ALL_CATEGORIES_LABEL };
