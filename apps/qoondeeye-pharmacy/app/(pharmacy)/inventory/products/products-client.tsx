"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Eye,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { getStoredUser } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Category,
  Product,
  createProduct,
  deleteProduct,
  getProductByBarcode,
  updateProduct,
} from "@/lib/api";
import { useErpCategories } from "@/hooks/queries/use-erp-categories";
import { useErpInventory } from "@/hooks/queries/use-erp-inventory";
import { useErpProductsCatalog } from "@/hooks/queries/use-erp-products-catalog";
import { erpKeys } from "@/lib/erp-query-keys";
import type { InventoryEntry } from "@/lib/services/inventory";

type FormMode = "create" | "edit";

type EditableProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  strength: string;
  formulation: string;
  unit: string;
  description: string;
};

export type ProductsPageClientProps = {
  initialProducts?: Product[] | null;
  initialCategories?: Category[] | null;
  initialInventory?: InventoryEntry[] | null;
  serverPrefetched?: boolean;
};

export default function ProductsPage({
  initialProducts = null,
  initialCategories = null,
  initialInventory = null,
  serverPrefetched = false,
}: ProductsPageClientProps) {
  const queryClient = useQueryClient();
  const [tenantSlug, setTenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const productsQuery = useErpProductsCatalog(tenantSlug, {
    initialData: serverPrefetched && initialProducts ? initialProducts : undefined,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Product | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [categoryTab, setCategoryTab] = useState<string>("__all__");
  const [query, setQuery] = useState("");

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

  const handleRefresh = () => {
    if (!tenantSlug.trim()) {
      setError("Enter a tenant slug to load products.");
      return;
    }
    setTenantSlug((prev) => prev.trim());
    void queryClient.invalidateQueries({ queryKey: ["erp"] });
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
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
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
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveProduct(null);
  };

  const handleOpenView = (prod: Product) => {
    setViewProduct(prod);
    setViewOpen(true);
  };

  const handleCloseView = () => {
    setViewOpen(false);
    setViewProduct(null);
  };

  const handleChange = (field: keyof EditableProduct, value: string) => {
    setActiveProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSkuBlurCreate = async () => {
    if (formMode !== "create" || !tenantSlug || !activeProduct) return;
    const code = activeProduct.sku.trim();
    if (code.length < 3) return;
    try {
      const p = await getProductByBarcode(tenantSlug, code);
      setActiveProduct({
        id: "",
        name: p.name,
        sku: p.sku ?? code,
        categoryId: p.categoryId ?? "",
        strength: p.strength ?? "",
        formulation: p.formulation ?? "",
        unit: p.unit ?? "",
        description: p.description ?? "",
      });
      setError(null);
    } catch {
      /* new barcode — keep typing */
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct || !tenantSlug) return;

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: activeProduct.name.trim(),
        sku: activeProduct.sku.trim() || undefined,
        categoryId: activeProduct.categoryId.trim() || undefined,
        strength: activeProduct.strength.trim() || undefined,
        formulation: activeProduct.formulation.trim() || undefined,
        unit: activeProduct.unit.trim() || undefined,
        description: activeProduct.description.trim() || undefined,
        catalogWide: true as const,
      };

      if (formMode === "create") {
        await createProduct(tenantSlug, payload);
      } else {
        await updateProduct(tenantSlug, activeProduct.id, {
          name: payload.name,
          sku: payload.sku,
          categoryId: payload.categoryId || null,
          strength: payload.strength,
          formulation: payload.formulation,
          unit: payload.unit,
          description: payload.description,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: erpKeys.productsCatalog(tenantSlug, ""),
        exact: false,
      });

      setFormOpen(false);
      setActiveProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
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
    if (!tenantSlug) return;
    if (!deleteCandidate) return;

    try {
      setDeletingId(deleteCandidate.id);
      setError(null);
      await deleteProduct(tenantSlug, deleteCandidate.id);
      await queryClient.invalidateQueries({
        queryKey: erpKeys.productsCatalog(tenantSlug, ""),
        exact: false,
      });
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
    const q = query.trim().toLowerCase();
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
  }, [categoryMap, categoryTab, products, query]);

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
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />
          <div className="hidden items-center gap-2 md:flex">
            <div className="relative w-[320px] max-w-[32vw]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or barcode..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Button variant="outline" className="gap-1.5 rounded-full">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              className="gap-1.5 rounded-full shadow-md shadow-primary/20 hover:bg-primary/90"
              onClick={handleOpenCreate}
              disabled={!tenantSlug}
            >
              <Plus className="h-4 w-4" />
              Add New Product
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Product Inventory
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage, track and update your pharmacy stock levels.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground md:self-auto">
              <span className="uppercase tracking-wide">Tenant</span>
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              <span className="font-medium text-foreground/80">
                {tenantSlug || "Not set"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Products"
              value={totalCount.toLocaleString()}
              tone="primary"
              hint="Synced from catalog"
            />
            <StatCard
              label="Low Stock"
              value="—"
              tone="warning"
              hint="Requires stock tracking"
            />
            <StatCard
              label="Expired Items"
              value="—"
              tone="destructive"
              hint="Requires batch tracking"
            />
            <StatCard
              label="Stock Value"
              value="—"
              tone="info"
              hint="Requires pricing"
            />
          </div>

          {displayError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {displayError}
            </p>
          )}

          <Card className="overflow-hidden rounded-2xl ring-1 ring-foreground/10">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <CardTitle>Products</CardTitle>
                  <CardDescription>
                    Backed by{" "}
                    <code className="font-mono text-xs">/api/products</code>{" "}
                    with <code className="font-mono text-xs">X-Tenant</code>.
                  </CardDescription>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  {totalCount} product{totalCount === 1 ? "" : "s"}
                </div>
              </div>

              <div className="flex flex-col gap-3 md:hidden">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or barcode..."
                    className="h-10 rounded-xl pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5 rounded-xl"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    className="flex-1 gap-1.5 rounded-xl"
                    onClick={handleOpenCreate}
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
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No products yet.</p>
                  <Button size="sm" className="mt-2" onClick={handleOpenCreate}>
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
                          if (value) setCategoryTab(value);
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

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Product Name</TableHead>
                        <TableHead>Strength / Form</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Barcode</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((prod) => {
                        const categoryName =
                          (prod.categoryId
                            ? categoryMap.get(prod.categoryId)?.name
                            : undefined) ??
                          prod.category?.name ??
                          "—";
                        const strengthForm = [
                          prod.strength?.trim(),
                          prod.formulation?.trim(),
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        const stockQty = productStockMap.get(prod.id) ?? 0;
                        return (
                          <TableRow key={prod.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {prod.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Stock: {stockQty.toLocaleString()}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {strengthForm || "—"}
                            </TableCell>
                            <TableCell>
                              {categoryName === "—" ? (
                                <span className="text-sm text-muted-foreground">
                                  —
                                </span>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="rounded-lg bg-primary/10 text-primary"
                                >
                                  {categoryName}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {prod.sku ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {prod.unit ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="rounded-lg text-muted-foreground hover:bg-muted"
                                      title="Actions"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                      <span className="sr-only">Actions</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                  >
                                    <DropdownMenuItem
                                      onSelect={() => handleOpenView(prod)}
                                    >
                                      <Eye className="h-4 w-4" />
                                      View
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => handleOpenEdit(prod)}
                                    >
                                      <Edit2 className="h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => requestDelete(prod)}
                                      disabled={deletingId === prod.id}
                                    >
                                      {deletingId === prod.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      Showing {showingCount === 0 ? 0 : 1}-{showingCount} of{" "}
                      {totalCount.toLocaleString()} products
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-lg"
                        disabled
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Previous</span>
                      </Button>
                      <div className="flex items-center gap-1">
                        <Button size="icon-sm" className="rounded-lg" disabled>
                          1
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-lg"
                          disabled
                        >
                          2
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-lg"
                          disabled
                        >
                          3
                        </Button>
                        <span className="px-1 text-muted-foreground">…</span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-lg"
                          disabled
                        >
                          257
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-lg"
                        disabled
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

          <footer className="border-t border-primary/10 py-6 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              © 2024 PharmaCore SaaS Management System. All rights reserved.
            </p>
          </footer>

          <Sheet
            open={formOpen}
            onOpenChange={(open) => {
              if (!open) handleCloseForm();
              else setFormOpen(true);
            }}
          >
            <SheetContent side="right" className="sm:max-w-lg">
              <form onSubmit={handleSubmit} className="flex h-full flex-col">
                <SheetHeader className="border-b">
                  <SheetTitle>
                    {formMode === "create" ? "New product" : "Edit product"}
                  </SheetTitle>
                  <SheetDescription>
                    Add key details like name, barcode, strength, and category.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {!activeProduct ? (
                    <div className="text-sm text-muted-foreground">
                      Select a product to edit.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="prod-name">Product name</Label>
                        <Input
                          id="prod-name"
                          value={activeProduct.name}
                          onChange={(e) => handleChange("name", e.target.value)}
                          required
                          placeholder="e.g. Amoxicillin"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="prod-sku">
                          Barcode / SKU (optional)
                        </Label>
                        <Input
                          id="prod-sku"
                          value={activeProduct.sku}
                          onChange={(e) => handleChange("sku", e.target.value)}
                          onBlur={() => void handleSkuBlurCreate()}
                          placeholder="Scan or type barcode, then tab away"
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select
                          value={activeProduct.categoryId || "__none__"}
                          onValueChange={(v) =>
                            handleChange(
                              "categoryId",
                              v === "__none__" ? "" : v,
                            )
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              No category
                            </SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="prod-strength">Strength</Label>
                          <Input
                            id="prod-strength"
                            value={activeProduct.strength}
                            onChange={(e) =>
                              handleChange("strength", e.target.value)
                            }
                            placeholder="500mg"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="prod-unit">Unit</Label>
                          <Input
                            id="prod-unit"
                            value={activeProduct.unit}
                            onChange={(e) =>
                              handleChange("unit", e.target.value)
                            }
                            placeholder="capsule, tablet, ml"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="prod-formulation">
                          Form (optional)
                        </Label>
                        <Input
                          id="prod-formulation"
                          value={activeProduct.formulation}
                          onChange={(e) =>
                            handleChange("formulation", e.target.value)
                          }
                          placeholder="Capsule, Suspension, Syrup"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="prod-desc">
                          Description (optional)
                        </Label>
                        <Input
                          id="prod-desc"
                          value={activeProduct.description}
                          onChange={(e) =>
                            handleChange("description", e.target.value)
                          }
                          placeholder="Brief notes to help staff"
                        />
                      </div>
                    </>
                  )}
                </div>

                <SheetFooter className="border-t">
                  <div className="flex w-full items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseForm}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving || !activeProduct}>
                      {saving && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      {formMode === "create"
                        ? "Create product"
                        : "Save changes"}
                    </Button>
                  </div>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>

          <Sheet
            open={viewOpen}
            onOpenChange={(open) =>
              open ? setViewOpen(true) : handleCloseView()
            }
          >
            <SheetContent side="right" className="sm:max-w-lg">
              <SheetHeader className="border-b">
                <SheetTitle>Product details</SheetTitle>
                <SheetDescription>
                  Quick view of the product metadata.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 overflow-y-auto p-4">
                {!viewProduct ? (
                  <div className="text-sm text-muted-foreground">
                    No product selected.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Name
                      </div>
                      <div className="text-sm font-semibold">
                        {viewProduct.name}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Barcode/SKU
                        </div>
                        <div className="text-sm font-mono">
                          {viewProduct.sku ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Category
                        </div>
                        <div className="text-sm">
                          {(viewProduct.categoryId
                            ? categoryMap.get(viewProduct.categoryId)?.name
                            : undefined) ??
                            viewProduct.category?.name ??
                            "—"}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Strength
                        </div>
                        <div className="text-sm">
                          {viewProduct.strength ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Unit
                        </div>
                        <div className="text-sm">{viewProduct.unit ?? "—"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Form
                      </div>
                      <div className="text-sm">
                        {viewProduct.formulation ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Description
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {viewProduct.description ?? "—"}
                      </div>
                    </div>
                    <div className="pt-2">
                      <Button
                        className="w-full"
                        onClick={() => {
                          handleCloseView();
                          handleOpenEdit(viewProduct);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit product
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Sheet
            open={deleteConfirmOpen}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteConfirmOpen(false);
                setDeleteCandidate(null);
              } else {
                setDeleteConfirmOpen(true);
              }
            }}
          >
            <SheetContent side="bottom" className="sm:max-w-none">
              <SheetHeader className="border-b">
                <SheetTitle>Delete product</SheetTitle>
                <SheetDescription>
                  This action cannot be undone.
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">
                    {deleteCandidate?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Barcode/SKU:{" "}
                    <span className="font-mono">
                      {deleteCandidate?.sku ?? "—"}
                    </span>
                  </div>
                </div>
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
                    onClick={handleConfirmDelete}
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
        </main>
      </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "warning" | "destructive" | "info";
}) {
  const iconTone =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-600"
        : tone === "destructive"
          ? "bg-rose-500/10 text-rose-600"
          : "bg-blue-500/10 text-blue-600";

  const hintTone =
    tone === "primary"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "destructive"
          ? "text-rose-600"
          : "text-blue-600";

  return (
    <Card className="rounded-2xl ring-1 ring-foreground/10">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <div className={`rounded-lg p-2 ${iconTone}`}>
            <Package className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className={`text-xs font-medium ${hintTone}`}>{hint}</div>
      </CardContent>
    </Card>
  );
}
