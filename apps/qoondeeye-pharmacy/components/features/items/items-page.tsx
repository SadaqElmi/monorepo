"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Package,
  Search,
  Stethoscope,
} from "lucide-react";

import { getStoredUser } from "@/lib/auth-client";
import {
  type Branch,
  type Category,
  type InventoryEntry,
  type Product,
  type PurchaseLinePricingRow,
  getBranches,
  getCategories,
  getInventory,
  getProductsCatalog,
  getPurchaseLinePricingByProduct,
} from "@/lib/api";
import {
  ITEMS_TABLE_PAGE_SIZE,
  buildInvLookup,
  categoryBadgeClass,
  computeProductAggregateRows,
  type ProductAggregateRow,
} from "@/components/features/items/items-inventory-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function parseMoneyField(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type ItemDisplayRow = ProductAggregateRow & {
  unitCost: number | null;
  sellingPrice: number | null;
  supplierName: string | null;
};

export default function ItemsPage() {
  const [tenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [linePricing, setLinePricing] = useState<PurchaseLinePricingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");
  const [branchFilter, setBranchFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      setError(null);
      const [p, c, b, inv, pricing] = await Promise.all([
        getProductsCatalog(tenantSlug),
        getCategories(tenantSlug),
        getBranches(tenantSlug),
        getInventory(tenantSlug, {
          includeAllBranches: true,
        }),
        getPurchaseLinePricingByProduct(tenantSlug, {
          includeAllBranches: true,
        }),
      ]);
      setProducts(p);
      setCategories(c);
      setBranches(b);
      setInventory(inv);
      setLinePricing(pricing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const invLookup = useMemo(() => buildInvLookup(inventory), [inventory]);

  const pricingByProduct = useMemo(() => {
    const m = new Map<string, PurchaseLinePricingRow>();
    for (const row of linePricing) {
      if (row.product_id) m.set(row.product_id, row);
    }
    return m;
  }, [linePricing]);

  const catalogSupplierByProduct = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      const name = p.supplierName?.trim();
      if (name) m.set(p.id, name);
    }
    return m;
  }, [products]);

  const flatRows: ItemDisplayRow[] = useMemo(() => {
    const base = computeProductAggregateRows(
      products,
      categories,
      branches,
      invLookup,
      categoryFilter,
      branchFilter,
      statusFilter,
      query,
    );
    return base.map((r) => {
      const pr = pricingByProduct.get(r.productId);
      return {
        ...r,
        unitCost: parseMoneyField(pr?.cost_price),
        sellingPrice: parseMoneyField(pr?.selling_price),
        supplierName:
          pr?.supplier_name?.trim() ||
          catalogSupplierByProduct.get(r.productId) ||
          null,
      };
    });
  }, [
    products,
    categories,
    branches,
    invLookup,
    categoryFilter,
    branchFilter,
    statusFilter,
    query,
    pricingByProduct,
    catalogSupplierByProduct,
  ]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, branchFilter, statusFilter, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(flatRows.length / ITEMS_TABLE_PAGE_SIZE),
  );

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_TABLE_PAGE_SIZE;
    return flatRows.slice(start, start + ITEMS_TABLE_PAGE_SIZE);
  }, [flatRows, currentPage]);

  const resetFilters = () => {
    setCategoryFilter("__all__");
    setBranchFilter("__all__");
    setStatusFilter("__all__");
    setQuery("");
    setPage(1);
  };

  const exportCsv = () => {
    const headers = [
      "Item no",
      "Item name",
      "Category",
      "Strength/Form",
      "Unit",
      "Quantity",
      "Reorder level",
      "Unit cost",
      "Unit price (selling)",
      "Supplier",
    ];
    function csvEscape(s: string) {
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }
    const lines = [
      headers.join(","),
      ...flatRows.map((r) =>
        [
          csvEscape(r.itemNo),
          csvEscape(r.name),
          csvEscape(r.categoryLabel),
          csvEscape(r.strengthForm),
          csvEscape(r.unit ?? ""),
          String(r.qty),
          String(r.reorder),
          r.unitCost != null ? String(r.unitCost) : "",
          r.sellingPrice != null ? String(r.sellingPrice) : "",
          csvEscape(r.supplierName ?? ""),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-items-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-linear-to-b from-teal-50/40 via-background to-background dark:from-teal-950/20">
      <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 p-4 pb-24 md:p-6 md:pb-28">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
              <Stethoscope className="size-5" aria-hidden />
            </div>
            <div>
              <h1 className="font-sans text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                Inventory items
              </h1>
              <p className="text-sm text-muted-foreground">
                One row per product with totals across locations. Prices reflect
                purchases first, then opening stock or batch costs. By-location
                detail:{" "}
                <Link
                  href="/items-locations"
                  className="font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
                >
                  Items by location
                </Link>
                . Edit catalog in{" "}
                <Link
                  href="/inventory/products"
                  className="font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
                >
                  Inventory → Products
                </Link>
                .
              </p>
            </div>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border border-teal-500/15 bg-card/40 shadow-lg shadow-teal-900/5 backdrop-blur-sm dark:border-teal-500/10 dark:bg-card/20 dark:shadow-black/20">
          <div className="border-b border-border/60 bg-linear-to-r from-teal-600/8 via-teal-600/3 to-transparent px-4 py-5 md:px-6 dark:from-teal-500/10 dark:via-teal-500/5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="relative min-w-[240px] flex-1 sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 rounded-xl border-border/80 bg-background/90 pl-9 shadow-inner"
                    placeholder="Search by name, item no, barcode…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger className="h-10 w-full min-w-[160px] rounded-xl bg-background/90 sm:w-[200px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="h-10 w-full min-w-[160px] rounded-xl bg-background/90 sm:w-[200px]">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All locations</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name ?? b.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full min-w-[140px] rounded-xl bg-background/90 sm:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="low">Low stock</SelectItem>
                    <SelectItem value="out">Out of stock</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 shrink-0 text-xs font-bold uppercase tracking-wider text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                  onClick={resetFilters}
                >
                  Reset filters
                </Button>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 rounded-xl border-border/80 bg-background/80"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 gap-2 rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25 hover:bg-teal-700"
                  onClick={exportCsv}
                  disabled={!flatRows.length}
                >
                  <Download className="size-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </div>

          {error ? (
            <p className="px-6 py-4 text-sm text-destructive">{error}</p>
          ) : null}

          <div className="max-h-[min(calc(100vh-260px),760px)] overflow-auto">
            {loading && !products.length ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Loading inventory…
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/95 shadow-sm backdrop-blur-md dark:bg-muted/90">
                  <TableRow className="border-b border-border/80 hover:bg-transparent">
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Item no
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Item name
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Category
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Strength / form
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Unit
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Quantity
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Reorder level
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Unit cost
                    </TableHead>
                    <TableHead className="min-w-[140px] whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Unit price
                      <span className="mt-0.5 block font-normal normal-case tracking-normal text-[10px] text-muted-foreground/90">
                        Selling price
                      </span>
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Supplier
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageSlice.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-16 text-center text-sm text-muted-foreground"
                      >
                        No rows match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageSlice.map((r) => (
                      <TableRow
                        key={r.key}
                        className="group border-b border-border/50 transition-colors hover:bg-teal-50/50 odd:bg-muted/20 dark:hover:bg-teal-950/25 dark:odd:bg-muted/10"
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.itemNo}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm font-semibold text-foreground">
                          {r.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={`text-[10px] font-bold uppercase tracking-tight ${categoryBadgeClass(r.categoryLabel)}`}
                          >
                            {r.categoryLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                          {r.strengthForm}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.unit ?? "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right text-sm font-bold tabular-nums ${
                            r.status === "out"
                              ? "text-destructive"
                              : r.status === "low"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-foreground"
                          }`}
                        >
                          {r.qty}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {r.reorder}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {formatMoney(r.unitCost)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-teal-800 dark:text-teal-300">
                          {formatMoney(r.sellingPrice)}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm text-foreground">
                          {r.supplierName ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/15 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {flatRows.length === 0
                  ? 0
                  : (currentPage - 1) * ITEMS_TABLE_PAGE_SIZE + 1}
                –
                {Math.min(currentPage * ITEMS_TABLE_PAGE_SIZE, flatRows.length)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">
                {flatRows.length.toLocaleString()}
              </span>{" "}
              products · Page{" "}
              <span className="font-medium text-foreground">{currentPage}</span>{" "}
              of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-lg"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-lg"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full bg-teal-600 text-white shadow-xl shadow-teal-600/30 hover:bg-teal-700"
        asChild
      >
        <Link href="/inventory/products" aria-label="Add or manage products">
          <Package className="size-6" />
        </Link>
      </Button>
    </div>
  );
}
