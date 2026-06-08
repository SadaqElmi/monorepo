"use client";

import * as React from "react";
import { Loader2, Plus, RefreshCw, Save } from "lucide-react";

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
  createOffer,
  getCategories,
  getOffers,
  getPriceGroups,
  getProductsCatalog,
  setOfferEnabled,
  type Category,
  type OfferList,
  type PriceGroup,
  type Product,
} from "@/lib/api";

type Draft = {
  description: string;
  offerType: string;
  discountType: string;
  discountValue: string;
  applyTo: "all" | "category" | "product";
  categoryId: string;
  productId: string;
  priceGroupId: string;
  priority: string;
  startDate: string;
  endDate: string;
  branchScope: string;
};

const emptyDraft: Draft = {
  description: "",
  offerType: "percentage",
  discountType: "percentage",
  discountValue: "10",
  applyTo: "all",
  categoryId: "",
  productId: "",
  priceGroupId: "",
  priority: "10",
  startDate: "",
  endDate: "",
  branchScope: "",
};

function dateText(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

export default function OfferListsPage() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [offers, setOffers] = React.useState<OfferList[]>([]);
  const [priceGroups, setPriceGroups] = React.useState<PriceGroup[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [filter, setFilter] = React.useState({ status: "", search: "" });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const [offerRows, groups, cats, productRows] = await Promise.all([
        getOffers(tenantSlug, {
          status: filter.status || undefined,
          search: filter.search.trim() || undefined,
        }),
        getPriceGroups(tenantSlug),
        getCategories(tenantSlug),
        getProductsCatalog(tenantSlug),
      ]);
      setOffers(offerRows);
      setPriceGroups(groups);
      setCategories(cats);
      setProducts(productRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load offers");
    } finally {
      setLoading(false);
    }
  }, [filter, tenantSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createRow() {
    if (!tenantSlug || !draft.description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const rule =
        draft.applyTo === "product" && draft.productId
          ? { productId: draft.productId }
          : draft.applyTo === "category" && draft.categoryId
            ? { categoryId: draft.categoryId }
            : {};
      await createOffer(tenantSlug, {
        description: draft.description.trim(),
        offerType: draft.offerType,
        discountType: draft.discountType,
        discountValue: Number(draft.discountValue),
        applyTo: draft.applyTo,
        priceGroupId: draft.priceGroupId || undefined,
        priority: Number(draft.priority || 0),
        startDate: draft.startDate || undefined,
        endDate: draft.endDate || undefined,
        branchScope: draft.branchScope
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        rules: [rule],
      });
      setDraft(emptyDraft);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create offer");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row: OfferList) {
    setSaving(true);
    setError(null);
    try {
      await setOfferEnabled(tenantSlug, row.id, row.status !== "enabled");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update offer status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Offer Lists
          </h1>
          <p className="text-sm text-muted-foreground">
            Promotions and discounts resolved by POS and sales orders.
          </p>
        </div>
        <Button onClick={load} variant="outline" disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 border-b pb-5 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_1fr]">
        <div className="space-y-2">
          <Label>Description</Label>
          <Input
            value={draft.description}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="10% Off Antibiotics"
          />
        </div>
        <div className="space-y-2">
          <Label>Offer Type</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.offerType}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                offerType: e.target.value,
                discountType:
                  e.target.value === "special_price"
                    ? "special_price"
                    : e.target.value === "fixed_amount"
                      ? "fixed_amount"
                      : "percentage",
              }))
            }
          >
            <option value="percentage">Percentage Discount</option>
            <option value="fixed_amount">Fixed Amount Discount</option>
            <option value="buy_x_get_y">Buy X Get Y</option>
            <option value="bundle">Bundle Promotion</option>
            <option value="special_price">Special Price</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Discount Type</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.discountType}
            onChange={(e) => setDraft((d) => ({ ...d, discountType: e.target.value }))}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed Amount</option>
            <option value="special_price">Special Price</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Value</Label>
          <Input value={draft.discountValue} onChange={(e) => setDraft((d) => ({ ...d, discountValue: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Price Group</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.priceGroupId}
            onChange={(e) => setDraft((d) => ({ ...d, priceGroupId: e.target.value }))}
          >
            <option value="">All groups</option>
            {priceGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Input value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} />
        </div>
      </section>

      <section className="grid gap-3 border-b pb-5 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <div className="space-y-2">
          <Label>Apply To</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.applyTo}
            onChange={(e) => setDraft((d) => ({ ...d, applyTo: e.target.value as Draft["applyTo"] }))}
          >
            <option value="all">All products</option>
            <option value="category">Category</option>
            <option value="product">Product</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.categoryId}
            onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
            disabled={draft.applyTo !== "category"}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Product</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.productId}
            onChange={(e) => setDraft((d) => ({ ...d, productId: e.target.value }))}
            disabled={draft.applyTo !== "product"}
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Start</Label>
          <Input type="date" value={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>End</Label>
          <Input type="date" value={draft.endDate} onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} />
        </div>
        <Button className="self-end" onClick={createRow} disabled={saving}>
          <Plus className="mr-2 size-4" />
          Add
        </Button>
      </section>

      <section className="grid gap-3 border-b pb-5 md:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-2">
          <Label>Search</Label>
          <Input
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder="Offer no or description"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={filter.status}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Branch Scope</Label>
          <Input
            value={draft.branchScope}
            onChange={(e) => setDraft((d) => ({ ...d, branchScope: e.target.value }))}
            placeholder="Branch IDs, comma separated"
          />
        </div>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>No.</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Price Group</TableHead>
            <TableHead className="text-right">Priority</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {offers.map((offer) => (
            <TableRow key={offer.id}>
              <TableCell className="font-mono text-xs">{offer.no}</TableCell>
              <TableCell>{offer.description}</TableCell>
              <TableCell>
                <Badge variant={offer.status === "enabled" ? "default" : "secondary"}>
                  {offer.status === "enabled" ? "Enabled" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell>{offer.priceGroupCode ?? "All"}</TableCell>
              <TableCell className="text-right">{offer.priority}</TableCell>
              <TableCell>{offer.offerType}</TableCell>
              <TableCell>
                {offer.discountType}: {String(offer.discountValue)}
              </TableCell>
              <TableCell>{dateText(offer.startDate)}</TableCell>
              <TableCell>{dateText(offer.endDate)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => toggle(offer)} disabled={saving}>
                  <Save className="mr-2 size-4" />
                  {offer.status === "enabled" ? "Disable" : "Enable"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!offers.length && !loading ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                No offers match the current filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </main>
  );
}
