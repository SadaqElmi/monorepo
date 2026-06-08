"use client";

import * as React from "react";
import { Download, History, Loader2, RefreshCw, Save, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  bulkUpdatePricing,
  getCategories,
  getPriceGroups,
  getPricingHistory,
  getPricingProducts,
  getSuppliers,
  updateProductPricing,
  type Category,
  type PriceGroup,
  type PricingProductRow,
  type ProductPriceHistory,
} from "@/lib/api";

type Draft = { costPrice: string; sellingPrice: string };

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function dateText(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

export default function PricingManagementPage() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [rows, setRows] = React.useState<PricingProductRow[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [suppliers, setSuppliers] = React.useState<Array<{ id: string; name?: string | null }>>([]);
  const [priceGroups, setPriceGroups] = React.useState<PriceGroup[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [history, setHistory] = React.useState<ProductPriceHistory[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<PricingProductRow | null>(null);
  const [filters, setFilters] = React.useState({
    search: "",
    categoryId: "",
    supplierId: "",
    priceGroupId: "",
  });
  const [bulkPercent, setBulkPercent] = React.useState("5");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const [priceRows, groups, cats, supplierRows] = await Promise.all([
        getPricingProducts(tenantSlug, {
          search: filters.search.trim() || undefined,
          categoryId: filters.categoryId || undefined,
          supplierId: filters.supplierId || undefined,
          priceGroupId: filters.priceGroupId || undefined,
          limit: 200,
        }),
        getPriceGroups(tenantSlug),
        getCategories(tenantSlug),
        getSuppliers(tenantSlug),
      ]);
      setRows(priceRows.items);
      setPriceGroups(groups);
      setCategories(cats);
      setSuppliers(supplierRows);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of priceRows.items) {
          next[row.productId] = next[row.productId] ?? {
            costPrice: money(row.currentCostPrice),
            sellingPrice: money(row.currentSellingPrice),
          };
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load pricing");
    } finally {
      setLoading(false);
    }
  }, [filters, tenantSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save(row: PricingProductRow) {
    const draft = drafts[row.productId];
    if (!tenantSlug || !draft) return;
    setSaving(true);
    setError(null);
    try {
      await updateProductPricing(tenantSlug, row.productId, {
        priceGroupId: filters.priceGroupId || row.priceGroupId || undefined,
        uomId: row.baseUomId || undefined,
        sellingPrice: Number(draft.sellingPrice),
        reason: "Pricing Management edit",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save price");
    } finally {
      setSaving(false);
    }
  }

  async function runBulkUpdate() {
    const percent = Number(bulkPercent);
    if (!Number.isFinite(percent) || percent === 0) return;
    setSaving(true);
    setError(null);
    try {
      await bulkUpdatePricing(tenantSlug, {
        categoryId: filters.categoryId || undefined,
        supplierId: filters.supplierId || undefined,
        priceGroupId: filters.priceGroupId || undefined,
        percentChange: percent,
        reason: "Pricing Management bulk update",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply bulk update");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(row: PricingProductRow) {
    setSelectedProduct(row);
    setHistory([]);
    try {
      const data = await getPricingHistory(tenantSlug, {
        productId: row.productId,
        priceGroupId: filters.priceGroupId || row.priceGroupId || undefined,
        limit: 50,
      });
      setHistory(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load price history");
    }
  }

  function exportRows() {
    const csv = [
      [
        "Item No",
        "Product Name",
        "Base UOM",
        "Current Cost Price",
        "Current Selling Price",
        "Last Purchase Cost",
        "Last Updated",
        "Margin %",
        "Status",
      ].join(","),
      ...rows.map((row) =>
        [
          row.itemNo ?? "",
          `"${String(row.productName).replace(/"/g, '""')}"`,
          row.baseUom ?? "",
          money(row.currentCostPrice),
          money(row.currentSellingPrice),
          money(row.lastPurchaseCost),
          dateText(row.lastUpdated),
          row.marginPercent ?? "",
          row.status ?? "",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pricing-management.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Pricing Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Bulk review and update product selling price and margin. Base cost is
            set on the product or updated from purchases.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportRows}>
            <Download className="mr-2 size-4" />
            Export
          </Button>
          <Button variant="outline" disabled title="Phase 2 import endpoint">
            <Upload className="mr-2 size-4" />
            Import
          </Button>
          <Button onClick={load} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 border-b pb-5 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto]">
        <div className="space-y-2">
          <Label>Search</Label>
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Item no, barcode, product"
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={filters.categoryId}
            onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Supplier</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={filters.supplierId}
            onChange={(e) => setFilters((f) => ({ ...f, supplierId: e.target.value }))}
          >
            <option value="">All suppliers</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name ?? supplier.id}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Price Group</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={filters.priceGroupId}
            onChange={(e) => setFilters((f) => ({ ...f, priceGroupId: e.target.value }))}
          >
            <option value="">Default group</option>
            {priceGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Bulk %</Label>
          <Input value={bulkPercent} onChange={(e) => setBulkPercent(e.target.value)} />
        </div>
        <Button className="self-end" onClick={runBulkUpdate} disabled={saving}>
          Apply
        </Button>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item No</TableHead>
            <TableHead>Product Name</TableHead>
            <TableHead>Base UOM</TableHead>
            <TableHead className="text-right">Base cost</TableHead>
            <TableHead className="text-right">Selling</TableHead>
            <TableHead className="text-right">Last Cost</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead className="text-right">Margin %</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const draft = drafts[row.productId] ?? {
              costPrice: money(row.currentCostPrice),
              sellingPrice: money(row.currentSellingPrice),
            };
            return (
              <TableRow key={row.productId}>
                <TableCell className="font-mono text-xs">{row.itemNo ?? "-"}</TableCell>
                <TableCell>{row.productName}</TableCell>
                <TableCell>{row.baseUom ?? "-"}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {money(row.currentCostPrice)}
                </TableCell>
                <TableCell>
                  <Input
                    className="ml-auto w-24 text-right"
                    value={draft.sellingPrice}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.productId]: { ...draft, sellingPrice: e.target.value },
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="text-right">{money(row.lastPurchaseCost)}</TableCell>
                <TableCell>{dateText(row.lastUpdated)}</TableCell>
                <TableCell className="text-right">{row.marginPercent ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.status ?? "active"}</Badge>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" onClick={() => save(row)} disabled={saving}>
                    <Save className="mr-2 size-4" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openHistory(row)}>
                    <History className="mr-2 size-4" />
                    History
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
          {!rows.length && !loading ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                No products match the current filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {selectedProduct ? (
        <section className="border-t pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">
                Price History
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedProduct.productName}
              </p>
            </div>
            <Button variant="outline" onClick={() => setSelectedProduct(null)}>
              Close
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Old Sell</TableHead>
                <TableHead className="text-right">New Sell</TableHead>
                <TableHead className="text-right">Old Cost</TableHead>
                <TableHead className="text-right">New Cost</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{dateText(row.createdAt)}</TableCell>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>{row.uomCode ?? "-"}</TableCell>
                  <TableCell className="text-right">{money(row.oldSellingPrice)}</TableCell>
                  <TableCell className="text-right">{money(row.newSellingPrice)}</TableCell>
                  <TableCell className="text-right">{money(row.oldCostPrice)}</TableCell>
                  <TableCell className="text-right">{money(row.newCostPrice)}</TableCell>
                  <TableCell>{row.changeReason ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </main>
  );
}
