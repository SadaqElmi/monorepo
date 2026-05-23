"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";

import { getStoredUser } from "@/lib/auth-client";
import { createPurchaseSchema, validateForSubmit } from "@/lib/validation";
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

import { BillsDeleteSheet } from "./bills-delete-sheet";
import { BillsDirectoryCard } from "./bills-directory-card";
import { BillsFormSheet } from "./bills-form-sheet";
import { formatDate } from "./bills-format";
import { BillsIntroAndStats } from "./bills-intro-and-stats";
import { BillsPurchasesPagination } from "./bills-purchases-pagination";
import { BillsPurchasesTable } from "./bills-purchases-table";
import { BillsStickyHeader } from "./bills-sticky-header";
import type { EditablePurchase, FormMode } from "./bills-types";

export type BillsPageProps = {
  /** When provided from RSC, avoids duplicate purchases list fetch on first paint. */
  initialPurchases?: Purchase[];
  serverPrefetched?: boolean;
};

export default function PurchasesPage({
  initialPurchases = [],
  serverPrefetched = false,
}: BillsPageProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [purchases, setPurchases] =
    React.useState<Purchase[]>(initialPurchases);
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
      const detail = (evt as CustomEvent).detail as {
        branchId?: string | null;
      };
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
  const [deleteCandidate, setDeleteCandidate] = React.useState<Purchase | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [productStockByBranch, setProductStockByBranch] = React.useState<
    ProductStockByBranch[]
  >([]);
  const [stockLoading, setStockLoading] = React.useState(false);

  const skipPurchasesOnceRef = React.useRef(
    serverPrefetched && initialPurchases.length > 0,
  );

  React.useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const shouldFetchPurchases = !skipPurchasesOnceRef.current;
        if (skipPurchasesOnceRef.current) skipPurchasesOnceRef.current = false;

        const [purchasesData, suppliersData, branchesData, productsData] =
          await Promise.all([
            shouldFetchPurchases
              ? getPurchases(tenantSlug)
              : Promise.resolve(initialPurchases),
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
      const supplierName = supplierMap.get(p.supplier_id ?? "")?.name ?? "";
      const branchName = branchMap.get(p.branch_id ?? "")?.name ?? "";
      const haystack = [p.invoice_number, supplierName, branchName, p.id]
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
  }, [filteredPurchases, page, pageSize]);

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

    const purchaseBody = {
      supplierId,
      branchId,
      invoiceNumber,
      totalAmount: totalAmountNum,
      purchaseDate,
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
    };
    const validated = validateForSubmit(createPurchaseSchema, purchaseBody);
    if (!validated.ok) return setError(validated.message);

    const payload = {
      supplierId: validated.data.supplierId,
      branchId: validated.data.branchId,
      invoiceNumber: validated.data.invoiceNumber,
      totalAmount: validated.data.totalAmount,
      purchaseDate: validated.data.purchaseDate,
    };

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        const created = await createPurchase(tenantSlug, validated.data);
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
      setError(err instanceof Error ? err.message : "Failed to save purchase");
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
      setPurchases((prev) => prev.filter((p) => p.id !== deleteCandidate.id));

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

  const newPurchaseDisabled =
    suppliers.length === 0 || branches.length === 0 || !tenantSlug;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BillsStickyHeader
        query={query}
        onQueryChange={setQuery}
        onNewPurchase={openCreate}
        newPurchaseDisabled={newPurchaseDisabled}
      />

      <main className="mx-auto flex-1 w-full max-w-7xl space-y-6 p-6 md:p-8">
        <BillsIntroAndStats totalPurchasesCount={purchases.length} />

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <BillsDirectoryCard query={query} onQueryChange={setQuery}>
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
              <BillsPurchasesTable
                purchases={pagedPurchases}
                supplierMap={supplierMap}
                branchMap={branchMap}
                onEdit={openEdit}
                onRequestDelete={requestDelete}
                deletingId={deletingId}
              />

              <BillsPurchasesPagination
                showingStart={showingStart}
                showingEnd={showingEnd}
                filteredTotal={filteredPurchases.length}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
                onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </>
          )}
        </BillsDirectoryCard>
      </main>

      <BillsFormSheet
        open={formOpen}
        setFormOpen={setFormOpen}
        formMode={formMode}
        activePurchase={activePurchase}
        setActivePurchase={setActivePurchase}
        suppliers={suppliers}
        branches={branches}
        products={products}
        productStockByBranch={productStockByBranch}
        stockLoading={stockLoading}
        saving={saving}
        syncBranchToSession={syncBranchToSession}
        withAutoTotal={withAutoTotal}
        closeForm={closeForm}
        onSubmit={handleSubmit}
      />

      <BillsDeleteSheet
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteCandidate(null);
        }}
        deleteCandidate={deleteCandidate}
        supplierMap={supplierMap}
        deletingId={deletingId}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteCandidate(null);
        }}
        onConfirmDelete={confirmDelete}
      />
    </div>
  );
}
