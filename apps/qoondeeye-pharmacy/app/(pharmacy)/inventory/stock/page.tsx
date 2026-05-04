"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  Loader2,
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getStoredUser } from "@/lib/auth-client";
import {
  getBranches,
  getInventory,
  getProducts,
  type Branch,
  type InventoryEntry,
  type Product,
} from "@/lib/api";

const ACTIVE_BRANCH_ID_KEY = "branchId";

function statusFor(quantity: number, reorderLevel: number) {
  if (quantity <= 0) {
    return { label: "Out of Stock", tone: "destructive" as const };
  }
  if (quantity <= reorderLevel) {
    return { label: "Low Stock", tone: "warning" as const };
  }
  return { label: "In Stock", tone: "primary" as const };
}

export default function InventoryPage() {
  const [tenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranchesState] = useState<Branch[]>([]);

  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(() => {
    try {
      if (typeof window === "undefined") return "__all__";
      const v = localStorage.getItem(ACTIVE_BRANCH_ID_KEY);
      if (!v || v === "all") return "__all__";
      return v;
    } catch {
      return "__all__";
    }
  });
  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewCandidate, setViewCandidate] = useState<InventoryEntry | null>(
    null,
  );

  const [analysisOpen, setAnalysisOpen] = useState(false);

  const pageSize = 5;
  const [page, setPage] = useState(1);

  const applyBranchFilter = (next: string) => {
    setBranchFilter(next);
    const branchId = next === "__all__" ? null : next;
    try {
      localStorage.setItem(
        ACTIVE_BRANCH_ID_KEY,
        branchId === null ? "all" : branchId,
      );
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent("activeBranchChanged", { detail: { branchId } }),
    );
  };

  // Keep inventory filter synced with the sidebar location switcher.
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as {
        branchId?: string | null;
      };
      const nextFilter = detail?.branchId ? detail.branchId : "__all__";
      setBranchFilter((prev) => (prev === nextFilter ? prev : nextFilter));
    };

    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [inventoryData, productsData, branchesData] = await Promise.all([
          getInventory(tenantSlug),
          getProducts(tenantSlug),
          getBranches(tenantSlug),
        ]);

        if (cancelled) return;
        setInventory(inventoryData);
        setProducts(productsData);
        setBranchesState(branchesData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load inventory",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, branchFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, branchFilter, categoryFilter]);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const branchMap = useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      const catId = p.categoryId ?? p.category?.id ?? null;
      const catName = p.category?.name ?? null;
      if (!catId || !catName) continue;
      map.set(catId, catName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [products]);

  const filteredInventory = useMemo(() => {
    const q = query.trim().toLowerCase();

    const res = inventory.filter((inv) => {
      const branchId = inv.branch_id ?? "";
      if (branchFilter !== "__all__" && branchId !== branchFilter) return false;

      const product = productMap.get(inv.product_id ?? "");
      const productCategoryId =
        product?.categoryId ?? product?.category?.id ?? null;

      if (categoryFilter !== "__all__") {
        if (!productCategoryId) return false;
        if (productCategoryId !== categoryFilter) return false;
      }

      if (!q) return true;
      const branchName = branchMap.get(branchId)?.name ?? "";
      const categoryName = product?.category?.name ?? "";
      const strengthForm = [product?.strength, product?.formulation]
        .filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0,
        )
        .join(" · ");

      const haystack = [
        product?.name,
        product?.genericName ?? undefined,
        product?.sku ?? undefined,
        strengthForm || undefined,
        categoryName || undefined,
        branchName || undefined,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    return res.sort((a, b) => {
      const aProd = productMap.get(a.product_id ?? "");
      const bProd = productMap.get(b.product_id ?? "");
      const aName = aProd?.name ?? "Unknown";
      const bName = bProd?.name ?? "Unknown";
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });
  }, [inventory, query, branchFilter, categoryFilter, productMap, branchMap]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredInventory.length / pageSize),
  );

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedInventory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredInventory.slice(start, start + pageSize);
  }, [filteredInventory, page]);

  const stats = useMemo(() => {
    const uniqueProducts = new Set(
      inventory
        .map((i) => i.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ).size;

    const outOfStock = inventory.filter((i) => (i.quantity ?? 0) <= 0).length;
    const lowStock = inventory.filter(
      (i) =>
        (i.quantity ?? 0) > 0 && (i.quantity ?? 0) <= (i.reorder_level ?? 0),
    ).length;

    const totalUnits = inventory.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

    return { uniqueProducts, outOfStock, lowStock, totalUnits };
  }, [inventory]);

  const downloadCsv = () => {
    const escapeCell = (value: unknown) => {
      const s = String(value ?? "");
      if (s.includes('"') || s.includes(",") || s.includes("\n")) {
        return `"${s.replaceAll('"', '""')}"`;
      }
      return s;
    };

    const header = [
      "Product",
      "Branch",
      "Available Quantity",
      "Reorder Level",
      "Status",
    ];

    const rows = filteredInventory.map((inv) => {
      const product = productMap.get(inv.product_id ?? "");
      const branch = branchMap.get(inv.branch_id ?? "");
      const qty = inv.quantity ?? 0;
      const reorderLevel = inv.reorder_level ?? 0;
      const s = statusFor(qty, reorderLevel);
      return [
        product ? product.name : "Unknown product",
        branch ? branch.name : "Unknown branch",
        qty,
        reorderLevel,
        s.label,
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_${tenantSlug}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const analysisItems = useMemo(() => {
    const low = inventory
      .map((inv) => {
        const qty = inv.quantity ?? 0;
        const reorderLevel = inv.reorder_level ?? 0;
        if (qty <= 0) {
          return { inv, shortage: reorderLevel + 1 };
        }
        if (qty > 0 && qty <= reorderLevel) {
          return { inv, shortage: reorderLevel - qty + 1 };
        }
        return null;
      })
      .filter(
        (x): x is { inv: InventoryEntry; shortage: number } => x !== null,
      );

    low.sort((a, b) => b.shortage - a.shortage);
    return low.slice(0, 8);
  }, [inventory]);

  const showingStart =
    filteredInventory.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredInventory.length);

  const renderStatusBadge = (inv: InventoryEntry) => {
    const qty = inv.quantity ?? 0;
    const reorderLevel = inv.reorder_level ?? 0;
    const s = statusFor(qty, reorderLevel);

    if (s.tone === "destructive") {
      return (
        <Badge
          variant="secondary"
          className="bg-red-100 text-red-700 border-red-200"
        >
          {s.label}
        </Badge>
      );
    }
    if (s.tone === "warning") {
      return (
        <Badge
          variant="secondary"
          className="bg-orange-100 text-orange-700 border-orange-200"
        >
          {s.label}
        </Badge>
      );
    }
    return (
      <Badge
        variant="secondary"
        className="bg-primary/10 text-primary border-primary/20"
      >
        {s.label}
      </Badge>
    );
  };

  const reloadInventory = async () => {
    const data = await getInventory(tenantSlug);
    setInventory(data);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />

          <div className="hidden items-center gap-2 md:flex">
            <div className="relative w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search inventory..."
                className="h-9 rounded-full pl-9"
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Inventory Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Read-only view. Stock updates from purchases, sales, and returns
                only.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-primary/70">
                  Total Products
                </p>
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-2xl font-black">
                    {stats.uniqueProducts.toLocaleString()}
                  </h3>
                  <div className="rounded-xl bg-primary/10 text-primary p-2">
                    <Package className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-primary/70">
                  Out of Stock
                </p>
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-2xl font-black text-red-600">
                    {stats.outOfStock.toLocaleString()}
                  </h3>
                  <div className="rounded-xl bg-red-100 text-red-700 p-2">
                    <Package className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-primary/70">
                  Low Stock Alert
                </p>
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-2xl font-black text-orange-600">
                    {stats.lowStock.toLocaleString()}
                  </h3>
                  <div className="rounded-xl bg-orange-100 text-orange-700 p-2">
                    <Package className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-primary/70">
                  Inventory Value
                </p>
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-2xl font-black text-primary">
                    {stats.totalUnits.toLocaleString()}
                  </h3>
                  <div className="rounded-xl bg-primary/10 text-primary p-2">
                    <Package className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Showing total units (pricing optional).
                </p>
              </CardContent>
            </Card>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-4 border-b bg-muted/20 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-56">
                    <Select
                      value={branchFilter}
                      onValueChange={applyBranchFilter}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Branches" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Branches</SelectItem>
                        {branches.map((b) => (
                          <SelectItem value={b.id} key={b.id}>
                            {b.name ?? "Unnamed branch"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-56">
                    <Select
                      value={categoryFilter}
                      onValueChange={setCategoryFilter}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Categories</SelectItem>
                        {categoryOptions.map((c) => (
                          <SelectItem value={c.id} key={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl"
                    onClick={() => {
                      applyBranchFilter("__all__");
                      setCategoryFilter("__all__");
                      setQuery("");
                    }}
                    disabled={loading}
                  >
                    <Search className="h-4 w-4" />
                    Filter
                  </Button>

                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl"
                    onClick={downloadCsv}
                    disabled={filteredInventory.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading inventory…
                  </div>
                ) : filteredInventory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <p>No inventory records match your filters.</p>
                    <p className="max-w-md text-xs">
                      New stock appears after you record a purchase for products
                      at this branch.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Product</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Available Quantity</TableHead>
                            <TableHead>Reorder Level</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center w-[220px]">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedInventory.map((inv) => {
                            const product = productMap.get(
                              inv.product_id ?? "",
                            );
                            const branch = branchMap.get(inv.branch_id ?? "");
                            const qty = inv.quantity ?? 0;
                            const reorderLevel = inv.reorder_level ?? 0;
                            const strengthForm = [
                              product?.strength ?? undefined,
                              product?.formulation ?? undefined,
                            ]
                              .filter(
                                (v): v is string =>
                                  typeof v === "string" && v.trim().length > 0,
                              )
                              .join(" · ");

                            const categoryName =
                              product?.category?.name ?? "Uncategorized";

                            const metaParts = [
                              categoryName !== "Uncategorized"
                                ? categoryName
                                : null,
                              strengthForm || null,
                            ].filter(Boolean);

                            const meta = metaParts.join(" • ");

                            return (
                              <TableRow
                                key={inv.id}
                                className="hover:bg-primary/5 transition-colors"
                              >
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                      <Package className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold">
                                        {product?.name ?? "Unknown product"}
                                      </p>
                                      <p className="text-[12px] text-primary/60">
                                        {meta || "—"}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm font-medium text-foreground/80">
                                    {branch?.name ?? "Unknown branch"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm font-bold">
                                    {qty.toLocaleString()}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm font-medium text-muted-foreground">
                                    {reorderLevel.toLocaleString()}
                                  </span>
                                </TableCell>
                                <TableCell>{renderStatusBadge(inv)}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      className="rounded-lg text-muted-foreground hover:bg-muted"
                                      title="View details"
                                      onClick={() => {
                                        setViewCandidate(inv);
                                        setViewOpen(true);
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                      <span className="sr-only">Read</span>
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-lg"
                                      title="Refresh inventory"
                                      onClick={reloadInventory}
                                    >
                                      Refresh
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-t">
                      <p className="text-xs font-medium text-muted-foreground">
                        Showing {showingStart}-{showingEnd} of{" "}
                        {filteredInventory.length} entries
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-lg"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span className="sr-only">Previous</span>
                        </Button>

                        <div className="flex items-center gap-1">
                          {Array.from(
                            { length: Math.min(totalPages, 3) },
                            (_, i) => i + 1,
                          ).map((p) => (
                            <Button
                              key={p}
                              size="icon-sm"
                              variant={p === page ? "default" : "outline"}
                              className={
                                p === page
                                  ? "rounded-lg"
                                  : "rounded-lg text-muted-foreground"
                              }
                              onClick={() => setPage(p)}
                            >
                              {p}
                            </Button>
                          ))}
                          {totalPages > 3 && page > 3 ? (
                            <span className="px-1 text-muted-foreground">
                              …
                            </span>
                          ) : null}
                        </div>

                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-lg"
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          disabled={page >= totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                          <span className="sr-only">Next</span>
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 rounded-2xl border border-primary/10 bg-primary/5 p-6">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-primary text-white flex items-center justify-center">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold">Predictive Restock Alert</h4>
                <p className="text-sm text-muted-foreground">
                  {analysisItems.length === 0
                    ? "No low-stock items detected."
                    : "AI-style analysis suggests restocking soon to avoid stockouts."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-2 border-primary text-primary rounded-xl"
              onClick={() => setAnalysisOpen(true)}
            >
              View Analysis
            </Button>
          </div>
        </main>

        <Sheet
          open={viewOpen}
          onOpenChange={(open) => {
            setViewOpen(open);
            if (!open) setViewCandidate(null);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <SheetHeader className="border-b">
              <SheetTitle>Inventory details</SheetTitle>
              <SheetDescription>
                Read-only. Quantities change when you post purchases, sales, or
                returns.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 overflow-y-auto p-4">
              {!viewCandidate ? (
                <p className="text-sm text-muted-foreground">
                  No record selected.
                </p>
              ) : (
                (() => {
                  const product = productMap.get(
                    viewCandidate.product_id ?? "",
                  );
                  const branch = branchMap.get(viewCandidate.branch_id ?? "");
                  const qty = viewCandidate.quantity ?? 0;
                  const reorderLevel = viewCandidate.reorder_level ?? 0;
                  return (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Product
                        </div>
                        <div className="text-sm font-semibold">
                          {product?.name ?? "Unknown product"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {product?.strength ? `${product.strength} ` : ""}
                          {product?.formulation ?? ""}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Branch
                        </div>
                        <div className="text-sm text-foreground/90">
                          {branch?.name ?? "Unknown branch"}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">
                            Available quantity
                          </div>
                          <div className="text-sm font-semibold">
                            {qty.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">
                            Reorder level
                          </div>
                          <div className="text-sm font-semibold">
                            {reorderLevel.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          Status
                        </div>
                        <div className="mt-2">
                          {renderStatusBadge(viewCandidate)}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Sheet
          open={analysisOpen}
          onOpenChange={(open) => {
            setAnalysisOpen(open);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <SheetHeader className="border-b">
              <SheetTitle>Restock analysis</SheetTitle>
              <SheetDescription>
                Computed from `quantity` vs `reorder level`.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto p-4">
              {analysisItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No low-stock items detected.
                </p>
              ) : (
                analysisItems.map(({ inv }) => {
                  const product = productMap.get(inv.product_id ?? "");
                  const branch = branchMap.get(inv.branch_id ?? "");
                  const qty = inv.quantity ?? 0;
                  const reorderLevel = inv.reorder_level ?? 0;
                  const suggested = Math.max(0, reorderLevel - qty) + 10; // simple heuristic
                  return (
                    <div
                      key={inv.id}
                      className="rounded-xl border bg-muted/20 p-3"
                    >
                      <div className="font-semibold text-sm">
                        {product?.name ?? "Unknown product"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Branch: {branch?.name ?? "Unknown branch"} • Quantity:{" "}
                        {qty} • Reorder level: {reorderLevel}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          Suggested restock (units)
                        </div>
                        <div className="text-sm font-bold text-primary">
                          {suggested.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-2">
                        Heuristic suggestion: reorder gap + buffer.
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
  );
}
