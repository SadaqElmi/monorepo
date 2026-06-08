"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  cancelPurchase,
  closePurchase,
  createPurchase,
  getBranches,
  getProductsCatalog,
  getPurchase,
  getPurchaseLinePricingByProduct,
  getSuppliers,
  type PurchaseLinePricingRow,
  postPurchaseInvoice,
  receivePurchase,
  releasePurchase,
  updatePurchase,
  getProductUoms,
  type Branch,
  type Product,
  type ProductUom,
  type Purchase,
  type Supplier,
} from "@/lib/api";
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  validateForSubmit,
} from "@/lib/validation";

import { formatMoney } from "./bills-format";
import {
  normalizePricingRow,
  productLineDefaultsFromPricing,
  resolveProductLinePricing,
} from "./purchase-line-defaults";
import { ProductSearchInput } from "./product-search-input";

type LineDraft = {
  key: string;
  productId: string;
  uomId?: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  conversionFactorToBase: number;
  updateSellingPrice: boolean;
  costPriceEdited: boolean;
  sellingPriceEdited: boolean;
  batchNumber: string;
  expiryDate: string;
};

function newLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    productId: "",
    quantity: 1,
    costPrice: 0,
    sellingPrice: 0,
    conversionFactorToBase: 1,
    updateSellingPrice: false,
    costPriceEdited: false,
    sellingPriceEdited: false,
    batchNumber: "",
    expiryDate: "",
  };
}

function defaultPurchaseUomId(uoms: ProductUom[]): string | undefined {
  return (
    uoms.find((u) => u.isPurchaseDefault && u.isActive) ??
    uoms.find((u) => u.isBase && u.isActive) ??
    uoms.find((u) => u.isActive) ??
    uoms[0]
  )?.uomId;
}

function formatUomOption(uom: ProductUom): string {
  const label = uom.symbol || uom.code;
  if (uom.isPurchaseDefault) return `${label} · Purchase`;
  if (uom.isBase) return `${label} · Base`;
  return label;
}

function statusVariant(status: string) {
  switch (status) {
    case "draft":
      return "secondary" as const;
    case "released":
      return "outline" as const;
    case "received":
      return "default" as const;
    case "invoiced":
      return "default" as const;
    case "closed":
      return "default" as const;
    case "cancelled":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export function PurchaseDocumentClient({
  purchaseId,
  mode,
}: {
  purchaseId?: string;
  mode: "new" | "view";
}) {
  const router = useRouter();
  const tenantSlug = getStoredUser()?.tenantSlug ?? "pharmacy1";
  const [loading, setLoading] = React.useState(mode === "view");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [purchase, setPurchase] = React.useState<Purchase | null>(null);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [linePricing, setLinePricing] = React.useState<
    PurchaseLinePricingRow[]
  >([]);

  const [supplierId, setSupplierId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [purchaseOrderNo, setPurchaseOrderNo] = React.useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = React.useState("");
  const [orderDate, setOrderDate] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [postingDate, setPostingDate] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()]);
  const [productUomsByProductId, setProductUomsByProductId] = React.useState<
    Record<string, ProductUom[]>
  >({});
  const loadedUomProducts = React.useRef(new Set<string>());

  const status = purchase?.status ?? (mode === "new" ? "draft" : "");
  const editable =
    mode === "new" || status === "draft" || status === "released";

  React.useEffect(() => {
    void (async () => {
      try {
        const [sup, br, prod] = await Promise.all([
          getSuppliers(tenantSlug),
          getBranches(tenantSlug),
          getProductsCatalog(tenantSlug),
        ]);
        setSuppliers(sup);
        setBranches(br);
        setProducts(prod);
        if (br.length) {
          const stored = localStorage.getItem("branchId");
          const match = br.find((b) => b.id === stored);
          setBranchId((current) => current || match?.id || br[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load reference data");
      }
    })();
  }, [tenantSlug]);

  React.useEffect(() => {
    if (!tenantSlug || !branchId) return;
    let cancelled = false;
    void getPurchaseLinePricingByProduct(tenantSlug, {
      includeAllBranches: true,
      branchId,
      supplierId: supplierId || undefined,
    })
      .then((pricing) => {
        if (!cancelled) setLinePricing(pricing);
      })
      .catch(() => {
        if (!cancelled) setLinePricing([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, branchId, supplierId]);

  React.useEffect(() => {
    if (mode !== "view" || !purchaseId) return;
    void (async () => {
      setLoading(true);
      try {
        const doc = await getPurchase(tenantSlug, purchaseId);
        if (!doc) {
          setError("Purchase not found");
          return;
        }
        setPurchase(doc);
        setSupplierId(doc.supplier_id ?? "");
        setBranchId(doc.branch_id ?? "");
        setPurchaseOrderNo(doc.purchase_order_no ?? "");
        setSupplierInvoiceNo(
          doc.supplier_invoice_no ?? doc.invoice_number ?? "",
        );
        setOrderDate(
          doc.order_date?.toString().slice(0, 10) ??
            doc.purchase_date?.toString().slice(0, 10) ??
            "",
        );
        setPostingDate(
          doc.posting_date?.toString().slice(0, 10) ??
            doc.purchase_date?.toString().slice(0, 10) ??
            "",
        );
        setDueDate(doc.due_date?.toString().slice(0, 10) ?? "");
        setNotes(doc.notes ?? "");
        setLines(
          (doc.items ?? []).map((it) => ({
            key: it.id,
            productId: it.product_id ?? "",
            uomId: it.uom_id ?? undefined,
            quantity: Number(it.quantity ?? 0),
            costPrice: Number(it.cost_price ?? 0),
            sellingPrice: Number(it.selling_price ?? 0),
            conversionFactorToBase: Number(
              it.conversion_factor_snapshot ?? 1,
            ),
            updateSellingPrice: it.update_selling_price === true,
            costPriceEdited: true,
            sellingPriceEdited: true,
            batchNumber:
              it.planned_batch_number ?? it.batch_number ?? "",
            expiryDate: (it.planned_expiry_date ?? it.expiry_date ?? "")
              .toString()
              .slice(0, 10),
          })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load purchase");
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, purchaseId, tenantSlug]);

  const productMap = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const pricingByProduct = React.useMemo(() => {
    const m = new Map<string, PurchaseLinePricingRow>();
    for (const row of linePricing) {
      const normalized = normalizePricingRow(row);
      if (normalized?.product_id) m.set(normalized.product_id, normalized);
    }
    return m;
  }, [linePricing]);

  const cacheProductUoms = React.useCallback(
    (productId: string, uoms: ProductUom[]) => {
      loadedUomProducts.current.add(productId);
      setProductUomsByProductId((prev) =>
        prev[productId] ? prev : { ...prev, [productId]: uoms },
      );
    },
    [],
  );

  React.useEffect(() => {
    const productIds = [
      ...new Set(lines.map((l) => l.productId).filter(Boolean)),
    ];
    const missing = productIds.filter(
      (pid) => !loadedUomProducts.current.has(pid),
    );
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (pid) => {
          try {
            return [pid, await getProductUoms(tenantSlug, pid)] as const;
          } catch {
            return [pid, [] as ProductUom[]] as const;
          }
        }),
      );
      if (cancelled) return;
      for (const [pid, uoms] of entries) {
        cacheProductUoms(pid, uoms);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lines, tenantSlug, cacheProductUoms]);

  const applyProductToLine = React.useCallback(
    async (lineKey: string, productId: string) => {
      if (!productId) {
        setLines((prev) =>
          prev.map((line) =>
            line.key === lineKey ? { ...newLine(), key: line.key } : line,
          ),
        );
        return;
      }
      const product = productMap.get(productId);
      const uoms = await getProductUoms(tenantSlug, productId).catch(
        () => [] as ProductUom[],
      );
      cacheProductUoms(productId, uoms);
      const uomId = defaultPurchaseUomId(uoms);
      const pricing = await resolveProductLinePricing(tenantSlug, productId, {
        branchId,
        supplierId: supplierId || undefined,
        uomId,
        cached: pricingByProduct.get(productId),
      });
      const normalized = normalizePricingRow(pricing);
      const preferredSupplierId = normalized?.supplier_id;
      if (!supplierId && preferredSupplierId) setSupplierId(preferredSupplierId);
      const defaults = productLineDefaultsFromPricing(pricing, product);
      setLines((prev) =>
        prev.map((l) =>
          l.key === lineKey
            ? {
                ...l,
                productId,
                uomId: normalized?.uom_id ?? uomId,
                costPrice: defaults.costPrice,
                sellingPrice: defaults.sellingPrice,
                conversionFactorToBase: defaults.conversionFactorToBase,
                batchNumber: defaults.batchNumber,
                expiryDate: defaults.expiryDate,
                updateSellingPrice: false,
                costPriceEdited: false,
                sellingPriceEdited: false,
              }
            : l,
        ),
      );
    },
    [
      tenantSlug,
      branchId,
      productMap,
      pricingByProduct,
      supplierId,
      cacheProductUoms,
    ],
  );

  const applyUomToLine = React.useCallback(
    async (lineKey: string, uomId: string) => {
      const current = lines.find((line) => line.key === lineKey);
      if (!current?.productId) return;
      const product = productMap.get(current.productId);
      const pricing = await resolveProductLinePricing(
        tenantSlug,
        current.productId,
        {
          branchId,
          supplierId: supplierId || undefined,
          uomId,
          cached: pricingByProduct.get(current.productId),
        },
      );
      const defaults = productLineDefaultsFromPricing(pricing, product);
      setLines((prev) =>
        prev.map((line) => {
          if (line.key !== lineKey) return line;
          return {
            ...line,
            uomId,
            conversionFactorToBase: defaults.conversionFactorToBase,
            costPrice: line.costPriceEdited
              ? line.costPrice
              : defaults.costPrice,
            sellingPrice: line.sellingPriceEdited
              ? line.sellingPrice
              : defaults.sellingPrice,
            batchNumber: defaults.batchNumber || line.batchNumber,
            expiryDate: defaults.expiryDate || line.expiryDate,
          };
        }),
      );
    },
    [
      lines,
      tenantSlug,
      branchId,
      supplierId,
      productMap,
      pricingByProduct,
    ],
  );

  const refreshLineDefaultsForSupplier = React.useCallback(
    async (nextSupplierId: string) => {
      const pricedLines = await Promise.all(
        lines
          .filter((line) => line.productId)
          .map(async (line) => {
            const product = productMap.get(line.productId);
            const pricing = await resolveProductLinePricing(
              tenantSlug,
              line.productId,
              {
                branchId,
                supplierId: nextSupplierId || undefined,
                uomId: line.uomId,
                cached: pricingByProduct.get(line.productId),
              },
            );
            return {
              key: line.key,
              defaults: productLineDefaultsFromPricing(pricing, product),
            };
          }),
      );
      const defaultsByKey = new Map(
        pricedLines.map((line) => [line.key, line.defaults]),
      );
      setLines((prev) =>
        prev.map((line) => {
          const defaults = defaultsByKey.get(line.key);
          if (!defaults) return line;
          return {
            ...line,
            uomId: line.uomId ?? defaults.uomId,
            conversionFactorToBase: defaults.conversionFactorToBase,
            costPrice: line.costPriceEdited
              ? line.costPrice
              : defaults.costPrice,
            sellingPrice: line.sellingPriceEdited
              ? line.sellingPrice
              : defaults.sellingPrice,
            batchNumber: defaults.batchNumber || line.batchNumber,
            expiryDate: defaults.expiryDate || line.expiryDate,
          };
        }),
      );
    },
    [
      lines,
      tenantSlug,
      branchId,
      productMap,
      pricingByProduct,
    ],
  );

  React.useEffect(() => {
    if (!editable || linePricing.length === 0) return;
    setLines((prev) =>
      prev.map((l) => {
        if (!l.productId) return l;
        const needsFill =
          (!l.costPriceEdited && !l.costPrice) || !l.batchNumber.trim();
        if (!needsFill) return l;
        const pricing = pricingByProduct.get(l.productId);
        if (!pricing) return l;
        const defaults = productLineDefaultsFromPricing(
          pricing,
          productMap.get(l.productId),
        );
        return {
          ...l,
          costPrice: l.costPriceEdited ? l.costPrice : defaults.costPrice,
          sellingPrice: l.sellingPriceEdited
            ? l.sellingPrice
            : defaults.sellingPrice,
          conversionFactorToBase: defaults.conversionFactorToBase,
          batchNumber: defaults.batchNumber || l.batchNumber,
          expiryDate: defaults.expiryDate || l.expiryDate,
          uomId: l.uomId ?? defaults.uomId,
        };
      }),
    );
  }, [editable, linePricing, pricingByProduct, productMap]);

  const lineTotal = lines.reduce((sum, l) => {
    const q = l.quantity || 0;
    const c = l.costPrice || 0;
    return sum + q * c;
  }, 0);

  const buildPayload = () => ({
    workflow: "draft" as const,
    supplierId: supplierId || undefined,
    branchId,
    purchaseOrderNo: purchaseOrderNo || undefined,
    supplierInvoiceNo: supplierInvoiceNo || undefined,
    invoiceNumber: supplierInvoiceNo || undefined,
    orderDate,
    postingDate,
    purchaseDate: postingDate,
    dueDate: dueDate || undefined,
    notes: notes || undefined,
    totalAmount: lineTotal,
    onCredit: true,
    items: lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => ({
        productId: l.productId,
        uomId: l.uomId,
        quantity: l.quantity,
        batchNumber: l.batchNumber || undefined,
        costPrice: l.costPrice,
        sellingPrice: l.sellingPrice || undefined,
        updateSellingPrice: l.updateSellingPrice,
        expiryDate: l.expiryDate || undefined,
      })),
  });

  const validateReceiveLines = () => {
    const receivableLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (receivableLines.length === 0) return "Add at least one line to receive.";
    if (receivableLines.some((l) => !l.batchNumber.trim())) {
      return "Batch number is required before receiving every line.";
    }
    if (receivableLines.some((l) => !l.expiryDate.trim())) {
      return "Expiry date is required before receiving every line.";
    }
    return null;
  };

  const validateDraftHeader = () => {
    if (!supplierId.trim()) return "Select a supplier.";
    if (!supplierInvoiceNo.trim()) return "Supplier invoice no. is required.";
    return null;
  };

  const persistDraft = async (): Promise<Purchase | null> => {
    const headerError = validateDraftHeader();
    if (headerError) {
      setError(headerError);
      return null;
    }

    const payload = buildPayload();
    if (mode === "new") {
      const validated = validateForSubmit(createPurchaseSchema, payload);
      if (!validated.ok) {
        setError(validated.message);
        return null;
      }
      const created = await createPurchase(tenantSlug, validated.data);
      router.push(`/vendors/bills/${created.id}`);
      return created;
    }

    if (!purchaseId) return null;
    const updatePayload = { ...payload };
    delete (updatePayload as { workflow?: unknown }).workflow;
    const validated = validateForSubmit(updatePurchaseSchema, updatePayload);
    if (!validated.ok) {
      setError(validated.message);
      return null;
    }
    const updated = await updatePurchase(tenantSlug, purchaseId, validated.data);
    const refreshed = await getPurchase(tenantSlug, purchaseId);
    setPurchase(refreshed ?? updated);
    return refreshed ?? updated;
  };

  const saveDraft = async () => {
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    fn: (t: string, id: string) => Promise<Purchase>,
  ) => {
    if (!purchaseId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await fn(tenantSlug, purchaseId);
      setPurchase(updated);
      const refreshed = await getPurchase(tenantSlug, purchaseId);
      if (refreshed) setPurchase(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const receiveCurrentPurchase = async () => {
    if (!purchaseId) return;
    setSaving(true);
    setError(null);
    try {
      const receiveError = validateReceiveLines();
      if (receiveError) {
        setError(receiveError);
        return;
      }
      if (editable) {
        const saved = await persistDraft();
        if (!saved) return;
      }
      const updated = await receivePurchase(tenantSlug, purchaseId);
      setPurchase(updated);
      const refreshed = await getPurchase(tenantSlug, purchaseId);
      if (refreshed) setPurchase(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receive failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/vendors/bills"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Bills
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {mode === "new" ? "New purchase order" : "Purchase document"}
          </h1>
          {status ? (
            <Badge variant={statusVariant(status)} className="mt-2 capitalize">
              {status.replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button onClick={() => void saveDraft()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save draft
            </Button>
          ) : null}
          {purchaseId && status === "draft" ? (
            <Button
              variant="outline"
              onClick={() => void runAction(releasePurchase)}
              disabled={saving}
            >
              Release
            </Button>
          ) : null}
          {purchaseId && (status === "draft" || status === "released") ? (
            <Button
              variant="outline"
              onClick={() => void receiveCurrentPurchase()}
              disabled={saving}
            >
              Receive
            </Button>
          ) : null}
          {purchaseId && status === "received" ? (
            <Button
              onClick={() => void runAction(postPurchaseInvoice)}
              disabled={saving}
            >
              Post invoice
            </Button>
          ) : null}
          {purchaseId && status === "invoiced" ? (
            <Button
              variant="outline"
              onClick={() => void runAction(closePurchase)}
              disabled={saving}
            >
              Close
            </Button>
          ) : null}
          {purchaseId &&
          status !== "cancelled" &&
          status !== "closed" ? (
            <Button
              variant="destructive"
              onClick={() => void runAction(cancelPurchase)}
              disabled={saving}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
          General
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="purchase-supplier">Supplier</Label>
            <Select
              value={supplierId}
              onValueChange={(value) => {
                setSupplierId(value);
                void refreshLineDefaultsForSupplier(value);
              }}
              disabled={!editable}
              required
            >
              <SelectTrigger id="purchase-supplier" aria-required>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select
              value={branchId}
              onValueChange={setBranchId}
              disabled={!editable}
            >
              <SelectTrigger>
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Purchase order no.</Label>
            <Input
              value={purchaseOrderNo}
              onChange={(e) => setPurchaseOrderNo(e.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase-supplier-invoice-no">
              Supplier invoice no.
            </Label>
            <Input
              id="purchase-supplier-invoice-no"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              disabled={!editable}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Order date</Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Posting date</Label>
            <Input
              type="date"
              value={postingDate}
              onChange={(e) => setPostingDate(e.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!editable}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Lines
          </h2>
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, newLine()])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add line
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Qty ordered</TableHead>
                <TableHead className="text-right">Qty received</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead className="text-center">Update sell</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Line total</TableHead>
                {editable ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => {
                const prod = productMap.get(line.productId);
                const lineUoms = line.productId
                  ? (productUomsByProductId[line.productId] ?? [])
                  : [];
                const purchaseItem = purchase?.items?.[idx];
                const selectedUom = lineUoms.find((u) => u.uomId === line.uomId);
                const unitLabel =
                  purchaseItem?.uom_symbol ||
                  purchaseItem?.uom_code ||
                  selectedUom?.symbol ||
                  selectedUom?.code ||
                  prod?.uomSymbol ||
                  prod?.uomCode ||
                  prod?.unit ||
                  "—";
                const received =
                  purchase?.items?.[idx]?.quantity_received ??
                  (status === "received" || status === "closed"
                    ? line.quantity
                    : 0);
                const lt = line.quantity * line.costPrice;
                return (
                  <TableRow key={line.key}>
                    <TableCell className="min-w-[220px]">
                      {editable ? (
                        <ProductSearchInput
                          products={products}
                          value={line.productId}
                          onValueChange={(productId) => {
                            void applyProductToLine(line.key, productId);
                          }}
                        />
                      ) : (
                        <span className="text-sm">
                          {prod?.itemNo ? `${prod.itemNo} — ` : ""}
                          {prod?.name ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[100px]">
                      {editable ? (
                        <Select
                          value={line.uomId ?? ""}
                          onValueChange={(uomId) =>
                            void applyUomToLine(line.key, uomId)
                          }
                          disabled={!line.productId || !lineUoms.length}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {lineUoms.map((uom) => (
                              <SelectItem key={uom.id} value={uom.uomId}>
                                {formatUomOption(uom)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{unitLabel}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? {
                                      ...l,
                                      quantity: Number(e.target.value) || 0,
                                    }
                                  : l,
                              ),
                            )
                          }
                        />
                      ) : (
                        line.quantity
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Number(received)}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={line.costPrice}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? {
                                      ...l,
                                      costPrice: Number(e.target.value) || 0,
                                      costPriceEdited: true,
                                    }
                                  : l,
                              ),
                            )
                          }
                        />
                      ) : (
                        formatMoney(line.costPrice)
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={line.sellingPrice}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? {
                                      ...l,
                                      sellingPrice:
                                        Number(e.target.value) || 0,
                                      sellingPriceEdited: true,
                                    }
                                  : l,
                              ),
                            )
                          }
                        />
                      ) : (
                        formatMoney(line.sellingPrice)
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {editable ? (
                        <Checkbox
                          checked={line.updateSellingPrice}
                          onCheckedChange={(checked) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? {
                                      ...l,
                                      updateSellingPrice: checked === true,
                                    }
                                  : l,
                              ),
                            )
                          }
                          aria-label="Update selling price on posting"
                        />
                      ) : line.updateSellingPrice ? (
                        <span className="text-xs text-muted-foreground">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          className="h-8"
                          value={line.batchNumber}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? { ...l, batchNumber: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      ) : (
                        line.batchNumber || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          type="date"
                          className="h-8"
                          value={line.expiryDate}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? { ...l, expiryDate: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      ) : (
                        line.expiryDate || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(lt)}
                    </TableCell>
                    {editable ? (
                      <TableCell>
                        <button
                          type="button"
                          className="text-destructive"
                          onClick={() =>
                            setLines((prev) =>
                              prev.length > 1
                                ? prev.filter((l) => l.key !== line.key)
                                : prev,
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-4 text-right text-sm font-semibold">
          Document total: {formatMoney(lineTotal)}
        </p>
      </div>
    </div>
  );
}
