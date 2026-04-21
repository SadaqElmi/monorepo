"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getStoredUser } from "@/lib/auth-client";
import {
  deletePurchase,
  getBranches,
  getInventoryStockByProduct,
  getProductsCatalog,
  getPurchases,
  getSuppliers,
  createPurchase,
  updatePurchase,
  type Branch,
  type Product,
  type ProductStockByBranch,
  type Purchase,
  type Supplier,
} from "@/lib/api";

import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

type FormMode = "create" | "edit";

type EditablePurchase = {
  id: string;
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  productId: string;
  quantity: string;
  batchNumber: string;
  costPrice: string;
  sellingPrice: string;
  expiryDate: string;
  totalAmount: string; // for input
  purchaseDate: string; // YYYY-MM-DD
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
}

function formatMoney(value: unknown) {
  if (value === null || value === undefined) return "—";

  const n =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;

  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PurchasesPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [branchKey, setBranchKey] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("branchId");
    if (!v || v === "all") return null;
    return v;
  });

  // Refetch branch-scoped data when the sidebar location changes.
  React.useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { branchId?: string | null };
      setBranchKey(detail?.branchId ?? null);
    };
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);

  const [query, setQuery] = React.useState("");
  const pageSize = 8;
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("create");
  const [activePurchase, setActivePurchase] =
    React.useState<EditablePurchase | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<Purchase | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [productStockByBranch, setProductStockByBranch] = React.useState<
    ProductStockByBranch[]
  >([]);
  const [stockLoading, setStockLoading] = React.useState(false);

  React.useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [purchasesData, suppliersData, branchesData, productsData] =
          await Promise.all([
            getPurchases(tenantSlug),
            getSuppliers(tenantSlug),
            getBranches(tenantSlug),
            getProductsCatalog(tenantSlug),
          ]);

        if (cancelled) return;
        setPurchases(purchasesData);
        setSuppliers(suppliersData);
        setBranches(branchesData);
        setProducts(productsData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load purchases",
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
  }, [tenantSlug, branchKey]);

  const supplierMap = React.useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const branchMap = React.useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );

  const filteredPurchases = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...purchases].sort((a, b) =>
      (b.purchase_date ?? "").localeCompare(a.purchase_date ?? ""),
    );
    if (!q) return list;

    return list.filter((p) => {
      const supplierName =
        supplierMap.get(p.supplier_id ?? "")?.name ?? "";
      const branchName = branchMap.get(p.branch_id ?? "")?.name ?? "";
      const haystack = [
        p.invoice_number,
        supplierName,
        branchName,
        p.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [purchases, query, supplierMap, branchMap]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPurchases.length / pageSize),
  );

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  React.useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedPurchases = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPurchases.slice(start, start + pageSize);
  }, [filteredPurchases, page]);

  const showingStart =
    filteredPurchases.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredPurchases.length);

  const syncBranchToSession = React.useCallback((branchId: string) => {
    if (!branchId) return;
    try {
      localStorage.setItem("branchId", branchId);
      window.dispatchEvent(
        new CustomEvent("activeBranchChanged", {
          detail: { branchId },
        }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const defaultBranchIdForForm = React.useCallback(() => {
    try {
      const v = localStorage.getItem("branchId");
      if (v && v !== "all" && branches.some((b) => b.id === v)) return v;
    } catch {
      /* ignore */
    }
    return branches[0]?.id ?? "";
  }, [branches]);

  React.useEffect(() => {
    if (!tenantSlug || !formOpen || !activePurchase?.productId?.trim()) {
      setProductStockByBranch([]);
      return;
    }
    const pid = activePurchase.productId;
    let cancelled = false;
    setStockLoading(true);
    void getInventoryStockByProduct(tenantSlug, pid)
      .then((rows) => {
        if (!cancelled) setProductStockByBranch(rows);
      })
      .catch(() => {
        if (!cancelled) setProductStockByBranch([]);
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, formOpen, activePurchase?.productId]);

  const withAutoTotal = (
    prev: EditablePurchase,
    patch: Partial<EditablePurchase>,
  ): EditablePurchase => {
    const next = { ...prev, ...patch };
    const qty = Number(next.quantity);
    const cost = Number(next.costPrice);
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(cost) && cost >= 0) {
      next.totalAmount = (qty * cost).toFixed(2);
    }
    return next;
  };

  const openCreate = () => {
    setFormMode("create");
    setProductStockByBranch([]);
    setActivePurchase({
      id: "",
      supplierId: suppliers[0]?.id ?? "",
      branchId: defaultBranchIdForForm(),
      invoiceNumber: "",
      productId: "",
      quantity: "1",
      batchNumber: "",
      costPrice: "",
      sellingPrice: "",
      expiryDate: "",
      totalAmount: "",
      purchaseDate: new Date().toISOString().slice(0, 10),
    });
    setFormOpen(true);
  };

  const openEdit = (p: Purchase) => {
    setFormMode("edit");
    setProductStockByBranch([]);
    setActivePurchase({
      id: p.id,
      supplierId: p.supplier_id ?? "",
      branchId: p.branch_id ?? "",
      invoiceNumber: p.invoice_number ?? "",
      productId: "",
      quantity: "1",
      batchNumber: "",
      costPrice: "",
      sellingPrice: "",
      expiryDate: "",
      totalAmount:
        p.total_amount === null || p.total_amount === undefined
          ? ""
          : String(p.total_amount),
      purchaseDate: formatDate(p.purchase_date),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActivePurchase(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !activePurchase) return;

    const supplierId = activePurchase.supplierId.trim();
    const branchId = activePurchase.branchId.trim();
    const invoiceNumber = activePurchase.invoiceNumber.trim();
    const purchaseDate = activePurchase.purchaseDate.trim();
    const totalAmountNum = Number(activePurchase.totalAmount);
    const quantityNum = Number(activePurchase.quantity);
    const costPriceNum = Number(activePurchase.costPrice);
    const sellingPriceNum = Number(activePurchase.sellingPrice);

    if (!supplierId) return setError("Select a supplier.");
    if (!branchId) return setError("Select a branch.");
    if (!invoiceNumber) return setError("Invoice number is required.");
    if (!purchaseDate) return setError("Purchase date is required.");
    if (!activePurchase.productId) return setError("Select a product.");
    if (!Number.isFinite(quantityNum) || quantityNum <= 0)
      return setError("Quantity must be greater than 0.");
    if (!Number.isFinite(totalAmountNum))
      return setError("Total amount must be a valid number.");

    const payload = {
      supplierId,
      branchId,
      invoiceNumber,
      totalAmount: totalAmountNum,
      purchaseDate,
    };

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        const created = await createPurchase(tenantSlug, {
          ...payload,
          items: [
            {
              productId: activePurchase.productId,
              quantity: quantityNum,
              batchNumber: activePurchase.batchNumber.trim() || undefined,
              costPrice: Number.isFinite(costPriceNum) ? costPriceNum : undefined,
              sellingPrice: Number.isFinite(sellingPriceNum)
                ? sellingPriceNum
                : undefined,
              expiryDate: activePurchase.expiryDate || undefined,
            },
          ],
        });
        setPurchases((prev) => [created, ...prev]);
      } else {
        const updated = await updatePurchase(
          tenantSlug,
          activePurchase.id,
          payload,
        );
        if (!updated) {
          setError("Purchase not found (it may have been deleted).");
          return;
        }
        setPurchases((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x)),
        );
      }

      setFormOpen(false);
      setActivePurchase(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save purchase",
      );
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (p: Purchase) => {
    setDeleteCandidate(p);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;
    try {
      setDeletingId(deleteCandidate.id);
      setError(null);

      await deletePurchase(tenantSlug, deleteCandidate.id);
      setPurchases((prev) =>
        prev.filter((p) => p.id !== deleteCandidate.id),
      );

      setDeleteConfirmOpen(false);
      setDeleteCandidate(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete purchase",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md supports-backdrop-filter:bg-background/60">
          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <div className="relative w-64 max-w-[32vw] hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search purchases..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Button
              className="gap-2 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              onClick={openCreate}
              disabled={
                suppliers.length === 0 || branches.length === 0 || !tenantSlug
              }
            >
              <Plus className="h-4 w-4" />
              New Purchase
            </Button>
          </div>
        </header>

        <main className="mx-auto flex-1 w-full max-w-7xl space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Purchases</h1>
              <p className="mt-1 max-w-xl text-base text-muted-foreground">
                Record supplier invoices and goods received.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="rounded-xl border bg-card shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  Total Purchases
                </p>
                <p className="text-2xl font-bold mt-1 text-primary">
                  {purchases.length.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  All purchase records
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  Active Orders
                </p>
                <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  0
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Not tracked yet
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  Pending Deliveries
                </p>
                <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                  0
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Not tracked yet
                </p>
              </CardContent>
            </Card>
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Card className="overflow-hidden rounded-xl border shadow-sm">
            <CardHeader className="border-b bg-muted/30 p-4">
              <CardTitle>Purchase directory</CardTitle>
              <CardDescription>
                Backed by <code className="font-mono text-xs">/api/purchases</code> with <code className="font-mono text-xs">X-Tenant</code>.
              </CardDescription>
              <div className="mt-3 relative sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search purchases..."
                  className="h-9 rounded-lg pl-9"
                />
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading purchases…
                </div>
              ) : pagedPurchases.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center text-sm text-muted-foreground">
                  <p>No purchases found.</p>
                  <Button
                    size="sm"
                    onClick={openCreate}
                    disabled={suppliers.length === 0 || branches.length === 0}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add first purchase
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Supplier
                          </TableHead>
                          <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Branch
                          </TableHead>
                          <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Invoice #
                          </TableHead>
                          <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Total
                          </TableHead>
                          <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Purchase Date
                          </TableHead>
                          <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Created At
                          </TableHead>
                          <TableHead className="w-24 text-right font-semibold uppercase tracking-wider text-primary">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedPurchases.map((p) => {
                          const supplierName =
                            supplierMap.get(p.supplier_id ?? "")?.name ??
                            "—";
                          const branchName =
                            branchMap.get(p.branch_id ?? "")?.name ?? "—";

                          return (
                            <TableRow
                              key={p.id}
                              className="hover:bg-primary/5 transition-colors"
                            >
                              <TableCell className="text-sm">
                                <div className="min-w-[200px]">
                                  <p className="font-semibold">{supplierName}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {p.id}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {branchName}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {p.invoice_number ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm font-semibold">
                                {formatMoney(p.total_amount)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(p.purchase_date)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(p.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-primary hover:text-primary/80"
                                    onClick={() => openEdit(p)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-500/80"
                                    onClick={() => requestDelete(p)}
                                    disabled={deletingId === p.id}
                                    title="Delete purchase (removes received stock from inventory)"
                                  >
                                    {deletingId === p.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">Delete</span>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing{" "}
                      <span className="font-medium">{showingStart}</span> to{" "}
                      <span className="font-medium">{showingEnd}</span> of{" "}
                      <span className="font-medium">
                        {filteredPurchases.length}
                      </span>{" "}
                      purchases
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Previous</span>
                      </Button>
                      {(() => {
                        const show = 5;
                        let start = Math.max(1, page - Math.floor(show / 2));
                        const end = Math.min(totalPages, start + show - 1);
                        if (end - start + 1 < show) {
                          start = Math.max(1, end - show + 1);
                        }

                        return Array.from(
                          { length: end - start + 1 },
                          (_, i) => start + i,
                        ).map((n) => (
                          <Button
                            key={n}
                            variant={n === page ? "default" : "outline"}
                            size="icon"
                            className="h-8 w-8 rounded-lg text-xs font-medium"
                            onClick={() => setPage(n)}
                          >
                            {n}
                          </Button>
                        ));
                      })()}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
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
            </CardContent>
          </Card>
        </main>

        <Sheet
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) closeForm();
            else setFormOpen(true);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <form onSubmit={handleSubmit} className="flex h-full flex-col">
              <SheetHeader className="border-b">
                <SheetTitle>
                  {formMode === "create" ? "New purchase" : "Edit purchase"}
                </SheetTitle>
                <SheetDescription>
                  Supplier invoice and goods received details.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {!activePurchase ? (
                  <p className="text-sm text-muted-foreground">
                    No purchase selected.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select
                        value={activePurchase.supplierId}
                        onValueChange={(v) =>
                          setActivePurchase((prev) =>
                            prev ? { ...prev, supplierId: v } : prev,
                          )
                        }
                      >
                        <SelectTrigger className="w-full rounded-lg">
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name ?? "Unnamed supplier"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Receiving branch</Label>
                      <Select
                        value={activePurchase.branchId}
                        onValueChange={(v) => {
                          syncBranchToSession(v);
                          setActivePurchase((prev) =>
                            prev ? { ...prev, branchId: v } : prev,
                          );
                        }}
                      >
                        <SelectTrigger className="w-full rounded-lg">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name ?? "Unnamed branch"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Stock is added to this branch. Changing branch updates
                        your session scope for the next save.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoice-number">Invoice number</Label>
                      <Input
                        id="invoice-number"
                        value={activePurchase.invoiceNumber}
                        onChange={(e) =>
                          setActivePurchase((prev) =>
                            prev ? { ...prev, invoiceNumber: e.target.value } : prev,
                          )
                        }
                        placeholder="e.g. INV-2026-0001"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Product</Label>
                      <Select
                        value={activePurchase.productId}
                        onValueChange={(v) =>
                          setActivePurchase((prev) =>
                            prev ? { ...prev, productId: v } : prev,
                          )
                        }
                      >
                        <SelectTrigger className="w-full rounded-lg">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {activePurchase.productId ? (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            On-hand by branch (same product, different stock)
                          </p>
                          {stockLoading ? (
                            <p className="text-xs text-muted-foreground">
                              Loading stock…
                            </p>
                          ) : productStockByBranch.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No stock rows yet, or no access to branch scope.
                            </p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="h-8 text-xs">
                                      Branch
                                    </TableHead>
                                    <TableHead className="h-8 text-right text-xs">
                                      Qty
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {productStockByBranch.map((row) => (
                                    <TableRow key={row.branchId}>
                                      <TableCell className="py-1.5 text-xs">
                                        {row.branchName ?? row.branchId.slice(0, 8)}
                                      </TableCell>
                                      <TableCell className="py-1.5 text-right text-xs font-mono tabular-nums">
                                        {row.quantity}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="line-quantity">Quantity</Label>
                        <Input
                          id="line-quantity"
                          type="number"
                          min={1}
                          step={1}
                          value={activePurchase.quantity}
                          onChange={(e) =>
                            setActivePurchase((prev) =>
                              prev
                                ? withAutoTotal(prev, { quantity: e.target.value })
                                : prev,
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="line-batch-number">Batch number</Label>
                        <Input
                          id="line-batch-number"
                          value={activePurchase.batchNumber}
                          onChange={(e) =>
                            setActivePurchase((prev) =>
                              prev ? { ...prev, batchNumber: e.target.value } : prev,
                            )
                          }
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="line-cost-price">Cost price</Label>
                        <Input
                          id="line-cost-price"
                          type="number"
                          min={0}
                          step={0.01}
                          value={activePurchase.costPrice}
                          onChange={(e) =>
                            setActivePurchase((prev) =>
                              prev
                                ? withAutoTotal(prev, { costPrice: e.target.value })
                                : prev,
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="line-selling-price">Selling price</Label>
                        <Input
                          id="line-selling-price"
                          type="number"
                          min={0}
                          step={0.01}
                          value={activePurchase.sellingPrice}
                          onChange={(e) =>
                            setActivePurchase((prev) =>
                              prev ? { ...prev, sellingPrice: e.target.value } : prev,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="line-expiry-date">Expiry date</Label>
                      <Input
                        id="line-expiry-date"
                        type="date"
                        value={activePurchase.expiryDate}
                        onChange={(e) =>
                          setActivePurchase((prev) =>
                            prev ? { ...prev, expiryDate: e.target.value } : prev,
                          )
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="total-amount">Total amount</Label>
                      <Input
                        id="total-amount"
                        type="number"
                        min={0}
                        step={0.01}
                        value={activePurchase.totalAmount}
                        autoComplete="off"
                        onChange={(e) =>
                          setActivePurchase((prev) =>
                            prev ? { ...prev, totalAmount: e.target.value } : prev,
                          )
                        }
                        placeholder="0.00"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Auto-calculated from quantity x cost price.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="purchase-date">Purchase date</Label>
                      <Input
                        id="purchase-date"
                        type="date"
                        value={activePurchase.purchaseDate}
                        onChange={(e) =>
                          setActivePurchase((prev) =>
                            prev ? { ...prev, purchaseDate: e.target.value } : prev,
                          )
                        }
                        required
                      />
                    </div>

                    {formMode === "edit" && activePurchase.id ? (
                      <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                        Editing purchase:{" "}
                        <span className="font-mono">{activePurchase.id}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <SheetFooter className="border-t">
                <div className="flex w-full items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    disabled={saving}
                    className="rounded-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      saving ||
                      !activePurchase ||
                      !activePurchase.supplierId ||
                      !activePurchase.branchId ||
                      !activePurchase.invoiceNumber.trim() ||
                      !activePurchase.purchaseDate ||
                      !activePurchase.totalAmount
                    }
                    className="rounded-lg"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {formMode === "create"
                      ? "Create purchase"
                      : "Save changes"}
                  </Button>
                </div>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>

        <Sheet
          open={deleteConfirmOpen}
          onOpenChange={(open) => {
            setDeleteConfirmOpen(open);
            if (!open) setDeleteCandidate(null);
          }}
        >
          <SheetContent side="bottom" className="sm:max-w-md">
            <SheetHeader className="border-b">
              <SheetTitle>Delete purchase</SheetTitle>
              <SheetDescription>
                This cannot be undone. If this purchase had line items, those
                quantities are removed from inventory and batches.
              </SheetDescription>
            </SheetHeader>

            <div className="p-4">
              {deleteCandidate ? (
                <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                  <div className="font-semibold">
                    {supplierMap.get(deleteCandidate.supplier_id ?? "")?.name ??
                      "Unnamed supplier"}
                  </div>
                  {(deleteCandidate.item_count ?? 0) > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      This purchase has {deleteCandidate.item_count} line item
                      {deleteCandidate.item_count === 1 ? "" : "s"}. Deleting will
                      reverse that stock in inventory, reduce linked batches, and
                      remove batch rows that reach zero quantity (blocked if stock
                      was already sold or adjusted away).
                    </div>
                  ) : null}
                  <div className="mt-2 text-muted-foreground">
                    Invoice:{" "}
                    <span className="font-mono">
                      {deleteCandidate.invoice_number ?? "—"}
                    </span>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    Total:{" "}
                    <span className="font-mono">
                      {formatMoney(deleteCandidate.total_amount)}
                    </span>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    Date:{" "}
                    <span className="font-mono">
                      {formatDate(deleteCandidate.purchase_date)}
                    </span>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    Created:{" "}
                    <span className="font-mono">
                      {formatDate(deleteCandidate.created_at)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <SheetFooter className="border-t">
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setDeleteCandidate(null);
                  }}
                  disabled={!!deletingId}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={!deleteCandidate || !!deletingId}
                >
                  {deletingId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Delete
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
  );
}

