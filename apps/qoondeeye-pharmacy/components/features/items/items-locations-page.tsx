"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MapPin,
  Package,
  Search,
} from "lucide-react";

import { getStoredUser } from "@/lib/auth-client";
import {
  type Branch,
  type Category,
  type InventoryEntry,
  type Product,
  getBranches,
  getCategories,
  getInventory,
  getProductsCatalog,
} from "@/lib/api";
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
import {
  ITEMS_TABLE_PAGE_SIZE,
  buildInvLookup,
  categoryBadgeClass,
  emeraldItemNo,
  formatStrengthForm,
  resolveCategoryLabel,
  stockStatus,
} from "@/components/features/items/items-inventory-shared";

type MatrixCell = {
  qty: number;
  reorder: number;
};

type MatrixRow = {
  key: string;
  productId: string;
  itemNo: string;
  name: string;
  genericName: string | null;
  categoryLabel: string;
  strengthForm: string;
  unit: string | null;
  totalQty: number;
  status: "in_stock" | "low" | "out";
  cells: Record<string, MatrixCell>;
};

export default function ItemsLocationsPage() {
  const [tenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
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
      const [p, c, b, inv] = await Promise.all([
        getProductsCatalog(tenantSlug),
        getCategories(tenantSlug),
        getBranches(tenantSlug),
        getInventory(tenantSlug, {
          includeAllBranches: true,
        }),
      ]);
      setProducts(p);
      setCategories(c);
      setBranches(b);
      setInventory(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const invLookup = useMemo(() => buildInvLookup(inventory), [inventory]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const visibleBranches = useMemo(() => {
    if (branchFilter === "__all__") return branches;
    return branches.filter((b) => b.id === branchFilter);
  }, [branches, branchFilter]);

  const matrixRows = useMemo<MatrixRow[]>(() => {
    const q = query.trim().toLowerCase();
    const rows: MatrixRow[] = [];

    for (const p of products) {
      const categoryLabel = resolveCategoryLabel(p, categoryMap);
      const itemNo = emeraldItemNo(p);
      const barcode =
        p.sku ?? (p as Product & { barcode?: string | null }).barcode ?? "";
      const productCategoryId = p.categoryId ?? p.category?.id ?? null;
      if (
        categoryFilter !== "__all__" &&
        productCategoryId !== categoryFilter
      ) {
        continue;
      }
      if (q) {
        const haystack = [
          p.name,
          itemNo,
          barcode,
          p.sku,
          p.genericName,
          p.id,
          p.description,
          categoryLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      let totalQty = 0;
      const reorderLevels: number[] = [];
      const cells: Record<string, MatrixCell> = {};
      for (const branch of visibleBranches) {
        const cell = invLookup.get(`${p.id}:${branch.id}`);
        const qty = cell?.qty ?? 0;
        const reorder = cell?.reorder ?? 10;
        cells[branch.id] = { qty, reorder };
        totalQty += qty;
        reorderLevels.push(reorder);
      }
      const minReorder =
        reorderLevels.length > 0 ? Math.min(...reorderLevels) : 10;
      const status = stockStatus(totalQty, minReorder);
      if (statusFilter !== "__all__" && status !== statusFilter) continue;

      rows.push({
        key: p.id,
        productId: p.id,
        itemNo,
        name: p.name,
        genericName: p.genericName ?? null,
        categoryLabel,
        strengthForm: formatStrengthForm(p),
        unit: p.unit ?? null,
        totalQty,
        status,
        cells,
      });
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [
    products,
    categoryMap,
    categoryFilter,
    query,
    visibleBranches,
    invLookup,
    statusFilter,
  ]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, branchFilter, statusFilter, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(matrixRows.length / ITEMS_TABLE_PAGE_SIZE),
  );

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_TABLE_PAGE_SIZE;
    return matrixRows.slice(start, start + ITEMS_TABLE_PAGE_SIZE);
  }, [matrixRows, currentPage]);

  const resetFilters = () => {
    setCategoryFilter("__all__");
    setBranchFilter("__all__");
    setStatusFilter("__all__");
    setQuery("");
    setPage(1);
  };

  const exportCsv = () => {
    const branchHeaders = visibleBranches.map((b) => b.name ?? b.id);
    const headers = [
      "Item no",
      "Item name",
      "Generic name",
      "Category",
      "Strength/Form",
      "Unit",
      ...branchHeaders,
      "Total quantity",
    ];
    function csvEscape(s: string) {
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }
    const lines = [
      headers.map(csvEscape).join(","),
      ...matrixRows.map((r) =>
        [
          csvEscape(r.itemNo),
          csvEscape(r.name),
          csvEscape(r.genericName ?? ""),
          csvEscape(r.categoryLabel),
          csvEscape(r.strengthForm),
          csvEscape(r.unit ?? ""),
          ...visibleBranches.map((b) => String(r.cells[b.id]?.qty ?? 0)),
          String(r.totalQty),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `items-by-location-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-linear-to-b from-teal-50/40 via-background to-background dark:from-teal-950/20">
      <div className="mx-auto w-full max-w-[1800px] flex-1 space-y-6 p-4 pb-24 md:p-6 md:pb-28">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
              <MapPin className="size-5" aria-hidden />
            </div>
            <div>
              <h1 className="font-sans text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                Items available by location
              </h1>
              <p className="text-sm text-muted-foreground">
                One row per product with branch stock columns. View aggregated
                totals on{" "}
                <Link
                  href="/items"
                  className="font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
                >
                  Items
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
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 gap-2 rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25 hover:bg-teal-700"
                  onClick={exportCsv}
                  disabled={!matrixRows.length}
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
                    {visibleBranches.map((b) => (
                      <TableHead
                        key={b.id}
                        className="min-w-[120px] whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
                      >
                        {b.name ?? b.id}
                      </TableHead>
                    ))}
                    <TableHead className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Total qty
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageSlice.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6 + visibleBranches.length}
                        className="py-16 text-center text-sm text-muted-foreground"
                      >
                        No rows match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageSlice.map((r: MatrixRow) => (
                      <TableRow
                        key={r.key}
                        className="group border-b border-border/50 transition-colors hover:bg-teal-50/50 odd:bg-muted/20 dark:hover:bg-teal-950/25 dark:odd:bg-muted/10"
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.itemNo}
                        </TableCell>
                        <TableCell className="max-w-[220px] text-sm font-semibold text-foreground">
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate">{r.name}</span>
                            <span className="text-xs italic text-muted-foreground">
                              {r.genericName ?? "—"}
                            </span>
                          </div>
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
                        {visibleBranches.map((b) => {
                          const cell = r.cells[b.id];
                          const cellStatus = stockStatus(
                            cell?.qty ?? 0,
                            cell?.reorder ?? 10,
                          );
                          return (
                            <TableCell
                              key={`${r.key}:${b.id}`}
                              className={`text-right text-sm font-semibold tabular-nums ${
                                cellStatus === "out"
                                  ? "text-destructive"
                                  : cellStatus === "low"
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-foreground"
                              }`}
                            >
                              {(cell?.qty ?? 0).toLocaleString()}
                            </TableCell>
                          );
                        })}
                        <TableCell
                          className={`text-right text-sm font-bold tabular-nums ${
                            r.status === "out"
                              ? "text-destructive"
                              : r.status === "low"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-foreground"
                          }`}
                        >
                          {r.totalQty.toLocaleString()}
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
                {matrixRows.length === 0
                  ? 0
                  : (currentPage - 1) * ITEMS_TABLE_PAGE_SIZE + 1}
                –
                {Math.min(currentPage * ITEMS_TABLE_PAGE_SIZE, matrixRows.length)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">
                {matrixRows.length.toLocaleString()}
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
