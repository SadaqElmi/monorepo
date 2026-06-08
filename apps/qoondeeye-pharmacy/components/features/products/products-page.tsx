"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { getStoredUser } from "@/lib/auth-client";
import {
  Product,
  addProductSupplier,
  createProduct,
  deleteProduct,
  getProductSuppliers,
  getProductUoms,
  getUoms,
  getSuppliersPaged,
  removeProductSupplier,
  setProductPreferredSupplier,
  upsertProductUom,
  type ProductUom,
  updateProduct,
  updateProductUom,
} from "@/lib/api";
import { useErpCategories } from "@/hooks/queries/use-erp-categories";
import { useErpInventory } from "@/hooks/queries/use-erp-inventory";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useErpProductsCatalog } from "@/hooks/queries/use-erp-products-catalog";
import { invalidateErpCatalogQueries } from "@/lib/invalidate-erp-catalog";
import { updateProductPricing } from "@/lib/services/pricing";

import { ProductDeleteSheet } from "./product-delete-sheet";
import { ProductFormSheet } from "./product-form-sheet";
import { ProductViewSheet } from "./product-view-sheet";
import { ProductsIntroAndStats } from "./products-intro-and-stats";
import { ProductsStickyHeader } from "./products-sticky-header";
import { ProductsTableCard } from "./products-table-card";
import {
  EMPTY_PRODUCT_UOM_DRAFT,
  TABLE_PAGE_SIZE,
  type EditableProduct,
  type FormMode,
  type FormUomDraft,
  type ProductUomDraft,
  type ProductsPageProps,
} from "./products-types";
import {
  buildInitialFormUomByCode,
  getEnabledFormUoms,
  priceToFormString,
  productUomDraftFromRow,
  toNullableNumber,
} from "./products-utils";

export type { ProductsPageProps };

export default function ProductsPage({
  initialProducts = null,
  initialCategories = null,
  initialInventory = null,
  serverPrefetched = false,
}: ProductsPageProps) {
  const queryClient = useQueryClient();
  const [tenantSlug, setTenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const productsQuery = useErpProductsCatalog(tenantSlug, {
    initialData:
      serverPrefetched && initialProducts ? initialProducts : undefined,
  });
  const categoriesQuery = useErpCategories(tenantSlug, {
    initialData:
      serverPrefetched && initialCategories ? initialCategories : undefined,
  });
  const inventoryQuery = useErpInventory(tenantSlug, {
    initialData:
      serverPrefetched && initialInventory ? initialInventory : undefined,
  });

  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const loading =
    productsQuery.isPending ||
    categoriesQuery.isPending ||
    inventoryQuery.isPending;
  const loadError =
    productsQuery.error ?? categoriesQuery.error ?? inventoryQuery.error;

  const [error, setError] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeProduct, setActiveProduct] = useState<EditableProduct | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Product | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [productSuppliers, setProductSuppliers] = useState<
    Awaited<ReturnType<typeof getProductSuppliers>>
  >([]);
  const [productUoms, setProductUoms] = useState<ProductUom[]>([]);
  const [allUoms, setAllUoms] = useState<Awaited<ReturnType<typeof getUoms>>>(
    [],
  );
  const [formUomByCode, setFormUomByCode] = useState<
    Record<string, FormUomDraft>
  >({});
  const [productUomDraft, setProductUomDraft] = useState<ProductUomDraft>(
    EMPTY_PRODUCT_UOM_DRAFT,
  );
  const [productUomEditing, setProductUomEditing] = useState<
    Record<string, ProductUomDraft>
  >({});
  const [allSuppliers, setAllSuppliers] = useState<
    Awaited<ReturnType<typeof getSuppliersPaged>>["items"]
  >([]);
  const [supplierToAdd, setSupplierToAdd] = useState("");
  const [supplierLinksLoading, setSupplierLinksLoading] = useState(false);
  const [supplierLinkSaving, setSupplierLinkSaving] = useState(false);
  const [uomSaving, setUomSaving] = useState(false);

  const [categoryTab, setCategoryTab] = useState<string>("__all__");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [tablePage, setTablePage] = useState(1);

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem("branchId");
        setActiveBranchId(!v || v === "all" ? null : v);
      } catch {
        setActiveBranchId(null);
      }
      setCategoryTab("__all__");
      setQuery("");
    };
    handler();
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);

  const dataUpdatedAt = Math.max(
    productsQuery.dataUpdatedAt,
    categoriesQuery.dataUpdatedAt,
    inventoryQuery.dataUpdatedAt,
  );
  const isListFetching =
    productsQuery.isFetching ||
    categoriesQuery.isFetching ||
    inventoryQuery.isFetching;

  const handleRefresh = () => {
    if (!tenantSlug.trim()) {
      setError("Enter a tenant slug to load products.");
      return;
    }
    setTenantSlug((prev) => prev.trim());
    void invalidateErpCatalogQueries(queryClient);
    void inventoryQuery.refetch();
  };

  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load products"
        : null);

  const handleOpenCreate = () => {
    if (!tenantSlug) {
      setError("Set the tenant slug before creating a product.");
      return;
    }
    setFormMode("create");
    setActiveProduct({
      id: "",
      name: "",
      sku: "",
      categoryId: "",
      strength: "",
      formulation: "",
      unit: "",
      description: "",
      costPrice: "",
      sellingPrice: "",
      reorderLevel: "10",
    });
    setFormUomByCode({});
    setFormNotice(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (prod: Product, notice?: string | null) => {
    if (!tenantSlug) return;
    setFormMode("edit");
    setActiveProduct({
      id: prod.id,
      name: prod.name,
      sku: prod.sku ?? "",
      categoryId: prod.categoryId ?? "",
      strength: prod.strength ?? "",
      formulation: prod.formulation ?? "",
      unit: prod.unit ?? "",
      description: prod.description ?? "",
      costPrice: priceToFormString(prod.uomCostPrice),
      sellingPrice: priceToFormString(prod.uomSellingPrice ?? prod.listPrice),
      reorderLevel: "10",
    });
    setFormUomByCode({});
    setFormNotice(notice ?? null);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveProduct(null);
    setFormUomByCode({});
    setFormNotice(null);
  };

  const handleOpenView = (prod: Product) => {
    setViewProduct(prod);
    setViewOpen(true);
  };

  const handleCloseView = () => {
    setViewOpen(false);
    setViewProduct(null);
    setProductSuppliers([]);
    setProductUoms([]);
    setAllUoms([]);
    setProductUomDraft(EMPTY_PRODUCT_UOM_DRAFT);
    setProductUomEditing({});
    setSupplierToAdd("");
  };

  useEffect(() => {
    if (!viewOpen || !viewProduct || !tenantSlug) return;
    let cancelled = false;
    setSupplierLinksLoading(true);
    void Promise.all([
      getProductSuppliers(tenantSlug, viewProduct.id),
      getProductUoms(tenantSlug, viewProduct.id),
      getSuppliersPaged(tenantSlug, { page: 1, limit: 200 }),
      getUoms(tenantSlug),
    ])
      .then(([links, uoms, suppliersPage, tenantUoms]) => {
        if (cancelled) return;
        setProductSuppliers(links);
        setProductUoms(uoms);
        setAllSuppliers(suppliersPage.items);
        setAllUoms(tenantUoms);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load product suppliers",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSupplierLinksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewOpen, viewProduct, tenantSlug]);

  useEffect(() => {
    if (!formOpen || formMode !== "create" || !tenantSlug) return;
    let cancelled = false;
    void getUoms(tenantSlug)
      .then((uoms) => {
        if (cancelled) return;
        const active = uoms.filter((u) => u.active !== false);
        setAllUoms(active);
        setFormUomByCode((prev) => {
          const hasExisting = Object.keys(prev).length > 0;
          if (!hasExisting) return buildInitialFormUomByCode(active);
          const next = buildInitialFormUomByCode(active);
          for (const code of Object.keys(next)) {
            const existing = prev[code];
            if (existing) next[code] = existing;
          }
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load UOMs");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [formOpen, formMode, tenantSlug]);

  const reloadProductSuppliers = async (productId: string) => {
    const links = await getProductSuppliers(tenantSlug, productId);
    setProductSuppliers(links);
  };

  const reloadProductUoms = async (productId: string) => {
    const uoms = await getProductUoms(tenantSlug, productId);
    setProductUoms(uoms);
  };

  const handleAddSupplierLink = async () => {
    if (!viewProduct || !supplierToAdd) return;
    try {
      setSupplierLinkSaving(true);
      await addProductSupplier(tenantSlug, viewProduct.id, {
        supplierId: supplierToAdd,
      });
      setSupplierToAdd("");
      await reloadProductSuppliers(viewProduct.id);
      await invalidateErpCatalogQueries(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add supplier");
    } finally {
      setSupplierLinkSaving(false);
    }
  };

  const handlePreferredSupplier = async (supplierId: string) => {
    if (!viewProduct) return;
    try {
      setSupplierLinkSaving(true);
      await setProductPreferredSupplier(tenantSlug, viewProduct.id, supplierId);
      await reloadProductSuppliers(viewProduct.id);
      await invalidateErpCatalogQueries(queryClient);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set preferred supplier",
      );
    } finally {
      setSupplierLinkSaving(false);
    }
  };

  const handleRemoveSupplierLink = async (supplierId: string) => {
    if (!viewProduct) return;
    try {
      setSupplierLinkSaving(true);
      await removeProductSupplier(tenantSlug, viewProduct.id, supplierId);
      await reloadProductSuppliers(viewProduct.id);
      await invalidateErpCatalogQueries(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove supplier");
    } finally {
      setSupplierLinkSaving(false);
    }
  };

  const handleChange = (field: keyof EditableProduct, value: string) => {
    if (field === "sku") {
      setFormNotice(null);
    }
    setActiveProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  };
  const toggleFormUomEnabled = (code: string, enabled: boolean) => {
    setFormUomByCode((prev) => {
      const row = prev[code];
      if (!row) return prev;

      const next = { ...prev };

      if (!enabled) {
        if (row.isBase) {
          const successor = Object.values(next).find(
            (candidate) => candidate.enabled && candidate.code !== code,
          );
          if (successor) {
            for (const key of Object.keys(next)) {
              const current = next[key];
              if (!current.enabled || current.code === code) continue;
              const isBase = current.code === successor.code;
              next[key] = {
                ...current,
                isBase,
                conversionFactorToBase: isBase
                  ? "1"
                  : current.conversionFactorToBase,
              };
            }
          }
        }
        next[code] = {
          ...row,
          enabled: false,
          isBase: false,
          isPurchaseDefault: false,
          isSalesDefault: false,
          isPosDefault: false,
        };
        return next;
      }

      const hasBase = Object.values(next).some(
        (candidate) => candidate.enabled && candidate.isBase,
      );
      const makeBase = !hasBase;
      next[code] = {
        ...row,
        enabled: true,
        isBase: makeBase,
        conversionFactorToBase: makeBase
          ? "1"
          : row.conversionFactorToBase || "1",
        isPurchaseDefault: makeBase ? true : row.isPurchaseDefault,
        isSalesDefault: makeBase ? true : row.isSalesDefault,
        isPosDefault: makeBase ? true : row.isPosDefault,
      };
      return next;
    });
  };

  const setFormUomBase = (code: string) => {
    setFormUomByCode((prev) => {
      const row = prev[code];
      if (!row?.enabled) return prev;

      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const current = next[key];
        if (!current.enabled) {
          next[key] = { ...current, isBase: false };
          continue;
        }
        const isBase = current.code === code;
        next[key] = {
          ...current,
          isBase,
          conversionFactorToBase: isBase ? "1" : current.conversionFactorToBase,
        };
      }
      return next;
    });
  };

  const patchFormUom = (code: string, patch: Partial<FormUomDraft>) => {
    if (patch.isBase) {
      setFormUomBase(code);
      return;
    }
    setFormUomByCode((prev) => {
      const row = prev[code];
      if (!row) return prev;
      const next = { ...prev };
      const singleDefaultKeys = [
        "isPurchaseDefault",
        "isSalesDefault",
        "isPosDefault",
      ] as const;
      for (const key of singleDefaultKeys) {
        if (patch[key] === true) {
          for (const currentCode of Object.keys(next)) {
            if (currentCode !== code) {
              next[currentCode] = { ...next[currentCode], [key]: false };
            }
          }
        }
      }
      next[code] = { ...row, ...patch };
      return next;
    });
  };

  const saveProductUomDraft = async (
    row: ProductUom | null,
    draft: ProductUomDraft,
  ) => {
    if (!viewProduct || !tenantSlug || !draft.uomId) return;
    const factor = Number(draft.conversionFactorToBase);
    if (!Number.isFinite(factor) || factor <= 0) {
      setError("UOM conversion factor must be greater than 0");
      return;
    }
    try {
      setUomSaving(true);
      setError(null);
      const sharedInput = {
        conversionFactorToBase: factor,
        isBase: draft.isBase,
        isPurchaseDefault: draft.isPurchaseDefault,
        isSalesDefault: draft.isSalesDefault,
        isPosDefault: draft.isPosDefault,
        isActive: draft.isActive,
        sellingPrice: toNullableNumber(draft.sellingPrice) ?? null,
      };
      if (row) {
        await updateProductUom(tenantSlug, viewProduct.id, row.id, sharedInput);
      } else {
        await upsertProductUom(tenantSlug, viewProduct.id, {
          uomId: draft.uomId,
          ...sharedInput,
        });
        setProductUomDraft(EMPTY_PRODUCT_UOM_DRAFT);
      }
      setProductUomEditing((prev) => {
        if (!row) return prev;
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      await reloadProductUoms(viewProduct.id);
      await invalidateErpCatalogQueries(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product UOM");
    } finally {
      setUomSaving(false);
    }
  };

  const disableProductUom = async (row: ProductUom) => {
    if (!viewProduct) return;
    await saveProductUomDraft(row, {
      ...productUomDraftFromRow(row),
      isActive: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct || !tenantSlug) return;

    try {
      setSaving(true);
      setError(null);

      const enabledFormUoms = getEnabledFormUoms(formUomByCode);
      if (formMode === "create" && enabledFormUoms.length === 0) {
        setError("Enable at least one unit of measure.");
        return;
      }

      const baseUomCode =
        formMode === "create"
          ? enabledFormUoms.find((row) => row.isBase)?.code.trim() ||
            enabledFormUoms[0]?.code.trim() ||
            ""
          : activeProduct.unit.trim();
      const payload = {
        name: activeProduct.name.trim(),
        sku: activeProduct.sku.trim() || undefined,
        categoryId: activeProduct.categoryId.trim() || undefined,
        strength: activeProduct.strength.trim() || undefined,
        formulation: activeProduct.formulation.trim() || undefined,
        unit: baseUomCode || undefined,
        description: activeProduct.description.trim() || undefined,
        catalogWide: true as const,
      };

      const costPrice = toNullableNumber(activeProduct.costPrice);
      const sellingPrice = toNullableNumber(activeProduct.sellingPrice);

      if (formMode === "create") {
        const reorderLevel = toNullableNumber(activeProduct.reorderLevel);
        await createProduct(tenantSlug, {
          ...payload,
          listPrice: sellingPrice,
          reorderLevel: reorderLevel ?? 10,
          uoms: enabledFormUoms.map((row) => ({
            code: row.code.trim(),
            conversionFactorToBase: Number(row.conversionFactorToBase || 1),
            isBase: row.isBase,
            isPurchaseDefault: row.isPurchaseDefault,
            isSalesDefault: row.isSalesDefault,
            isPosDefault: row.isPosDefault,
            ...(row.isBase && costPrice != null ? { costPrice } : {}),
            sellingPrice: toNullableNumber(row.sellingPrice) ?? sellingPrice,
          })),
        });
      } else {
        await updateProduct(tenantSlug, activeProduct.id, {
          name: payload.name,
          sku: payload.sku,
          categoryId: payload.categoryId || null,
          strength: payload.strength,
          formulation: payload.formulation,
          unit: payload.unit,
          description: payload.description,
          listPrice: sellingPrice ?? null,
        });
        if (costPrice !== undefined) {
          await updateProductPricing(tenantSlug, activeProduct.id, {
            costPrice: costPrice ?? 0,
          });
        }
      }
      await invalidateErpCatalogQueries(queryClient);

      setFormOpen(false);
      setActiveProduct(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save product";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (prod: Product) => {
    if (!tenantSlug) return;
    setDeleteCandidate(prod);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;

    try {
      setDeletingId(deleteCandidate.id);
      setError(null);
      await deleteProduct(tenantSlug, deleteCandidate.id);
      await invalidateErpCatalogQueries(queryClient);
      setDeleteConfirmOpen(false);
      setDeleteCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeletingId(null);
    }
  };

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return [...products]
      .filter((p) =>
        categoryTab === "__all__" ? true : p.categoryId === categoryTab,
      )
      .filter((p) => {
        if (!q) return true;
        const haystack = [
          p.name,
          p.sku,
          p.formulation,
          p.strength,
          p.unit,
          p.description,
          categoryMap.get(p.categoryId ?? "")?.name,
          p.category?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [categoryMap, categoryTab, products, debouncedQuery]);

  useEffect(() => {
    setTablePage(1);
  }, [debouncedQuery, categoryTab]);

  const tableTotalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / TABLE_PAGE_SIZE),
  );
  const safeTablePage = Math.min(tablePage, tableTotalPages);
  const pagedProducts = useMemo(() => {
    const start = (safeTablePage - 1) * TABLE_PAGE_SIZE;
    return filteredProducts.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredProducts, safeTablePage]);

  const productStockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of inventory) {
      const productId = item.product_id;
      if (!productId) continue;
      if (activeBranchId && item.branch_id !== activeBranchId) continue;
      map.set(productId, (map.get(productId) ?? 0) + Number(item.quantity ?? 0));
    }
    return map;
  }, [inventory, activeBranchId]);

  const showingCount = filteredProducts.length;
  const totalCount = products.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProductsStickyHeader
        query={query}
        onQueryChange={setQuery}
        onAddProduct={handleOpenCreate}
        addDisabled={!tenantSlug}
      />

      <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
        <ProductsIntroAndStats tenantSlug={tenantSlug} totalCount={totalCount} />

        {displayError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {displayError}
          </p>
        ) : null}

        <ProductsTableCard
          tenantSlug={tenantSlug}
          loading={loading}
          totalCount={totalCount}
          showingCount={showingCount}
          query={query}
          onQueryChange={setQuery}
          categoryTab={categoryTab}
          onCategoryTabChange={setCategoryTab}
          categories={categories}
          filteredProducts={filteredProducts}
          pagedProducts={pagedProducts}
          categoryMap={categoryMap}
          productStockMap={productStockMap}
          tablePage={safeTablePage}
          tableTotalPages={tableTotalPages}
          onTablePageChange={setTablePage}
          dataUpdatedAt={dataUpdatedAt}
          isListFetching={isListFetching}
          onRefresh={handleRefresh}
          onAddProduct={handleOpenCreate}
          deletingId={deletingId}
          onView={handleOpenView}
          onEdit={handleOpenEdit}
          onDelete={requestDelete}
        />

        <footer className="border-t border-primary/10 py-6 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            © 2024 PharmaCore SaaS Management System. All rights reserved.
          </p>
        </footer>

        <ProductFormSheet
          open={formOpen}
          mode={formMode}
          product={activeProduct}
          categories={categories}
          allUoms={allUoms}
          formUomByCode={formUomByCode}
          formNotice={formNotice}
          saving={saving}
          onOpenChange={setFormOpen}
          onClose={handleCloseForm}
          onSubmit={handleSubmit}
          onFieldChange={handleChange}
          onToggleFormUomEnabled={toggleFormUomEnabled}
          onPatchFormUom={patchFormUom}
          onSetFormUomBase={setFormUomBase}
        />

        <ProductViewSheet
          open={viewOpen}
          product={viewProduct}
          categoryMap={categoryMap}
          productSuppliers={productSuppliers}
          productUoms={productUoms}
          allUoms={allUoms}
          allSuppliers={allSuppliers}
          productUomDraft={productUomDraft}
          productUomEditing={productUomEditing}
          supplierToAdd={supplierToAdd}
          supplierLinksLoading={supplierLinksLoading}
          supplierLinkSaving={supplierLinkSaving}
          uomSaving={uomSaving}
          onOpenChange={setViewOpen}
          onClose={handleCloseView}
          onEdit={handleOpenEdit}
          onDraftChange={setProductUomDraft}
          onEditingChange={setProductUomEditing}
          onAddUom={() => saveProductUomDraft(null, productUomDraft)}
          onSaveUom={saveProductUomDraft}
          onDisableUom={disableProductUom}
          draftFromRow={productUomDraftFromRow}
          onSupplierToAddChange={setSupplierToAdd}
          onAddSupplier={handleAddSupplierLink}
          onSetPreferred={handlePreferredSupplier}
          onRemoveSupplier={handleRemoveSupplierLink}
        />

        <ProductDeleteSheet
          open={deleteConfirmOpen}
          product={deleteCandidate}
          deleting={!!deletingId}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteConfirmOpen(false);
              setDeleteCandidate(null);
            } else {
              setDeleteConfirmOpen(true);
            }
          }}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setDeleteCandidate(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      </main>
    </div>
  );
}
