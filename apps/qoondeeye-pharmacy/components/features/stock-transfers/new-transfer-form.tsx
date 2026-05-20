"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bolt,
  CheckCircle2,
  Info,
  Loader2,
  MapPin,
  Pill,
  PlusCircle,
  Trash2,
} from "lucide-react";

import { branchesToMap, transferDtoToDetail } from "@/components/features/stock-transfers/transfer-mappers";
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
import { getEffectiveClientBranchId } from "@/lib/branch-access";
import { getBranches, type Branch } from "@/lib/services/branches";
import { getInventory } from "@/lib/services/inventory";
import { getTransferProducts, type Product } from "@/lib/services/products";
import {
  type TransferDto,
  confirmTransfer,
  createTransfer,
  getTransfer,
  updateTransfer,
} from "@/lib/services/transfers";
import { inventoryTransferDetailPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { createTransferDraftSchema, validateForSubmit } from "@/lib/validation";
import { toast } from "sonner";

type LineRow = {
  clientKey: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  available: number;
  quantity: number;
};

function newLine(p: Product | null, available: number): LineRow {
  return {
    clientKey: `l-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    productId: p?.id ?? "",
    productName: p?.name?.trim() || "Select product",
    sku: p?.sku?.trim() || "—",
    unit: p?.unit?.trim() || "—",
    available,
    quantity: p ? 1 : 0,
  };
}

function availabilityByProduct(
  branchId: string | undefined,
  inventory: { product_id: string | null; branch_id: string | null; quantity: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  if (!branchId) return m;
  for (const row of inventory) {
    if (row.branch_id === branchId && row.product_id) {
      m.set(row.product_id, row.quantity ?? 0);
    }
  }
  return m;
}

function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps: { n: 1 | 2 | 3 | 4; label: string }[] = [
    { n: 1, label: "Draft" },
    { n: 2, label: "Confirm" },
    { n: 3, label: "Ship" },
    { n: 4, label: "Receive" },
  ];

  return (
    <Card className="mb-8 rounded-2xl border-primary/10 shadow-sm">
      <CardContent className="p-6">
        <div className="relative flex items-center justify-between gap-1 overflow-x-auto">
          <div className="absolute left-0 top-1/2 z-0 h-0.5 w-full min-w-[240px] -translate-y-1/2 bg-muted" />
          {steps.map((s) => {
            const active = s.n === step;
            const done = s.n < step;
            return (
              <div
                key={s.n}
                className="relative z-10 flex min-w-[4.5rem] flex-col items-center gap-2 bg-card px-1 sm:px-3"
              >
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full text-sm font-bold shadow-md",
                    done || active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.n}
                </div>
                <span
                  className={cn(
                    "text-center text-[10px] font-bold uppercase tracking-wider sm:text-xs",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          This screen saves a <strong className="text-foreground">draft</strong> and can{" "}
          <strong className="text-foreground">confirm</strong> the order.{" "}
          <strong className="text-foreground">Ship</strong> and{" "}
          <strong className="text-foreground">receive</strong> run from the transfer detail and
          incoming queue.
        </p>
      </CardContent>
    </Card>
  );
}

export function NewTransferForm({ editId }: { editId?: string | null }) {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<
    { product_id: string | null; branch_id: string | null; quantity: number }[]
  >([]);
  const [transferId, setTransferId] = useState<string | null>(editId ?? null);
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setTenantSlug(u?.tenantSlug?.trim() ?? null);
  }, []);

  function applyTransferDto(tr: TransferDto, bm: Map<string, string>, inv: typeof inventory) {
    const detail = transferDtoToDetail(
      tr,
      bm,
      availabilityByProduct(tr.from_branch_id, inv),
    );
    setSourceId(tr.from_branch_id ?? "");
    setDestId(tr.to_branch_id ?? "");
    setLines(
      detail.lines.map((l) => {
        const item = tr.items?.find((it) => it.id === l.id);
        return {
          clientKey: l.id,
          productId: item?.product_id ?? "",
          productName: l.productName,
          sku: l.sku,
          unit: l.unit,
          available: l.available,
          quantity: l.quantity,
        };
      }),
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tenantSlug) {
        setBootLoading(false);
        return;
      }
      setBootLoading(true);
      try {
        const [br, catalog, inv] = await Promise.all([
          getBranches(tenantSlug),
          getTransferProducts(tenantSlug),
          getInventory(tenantSlug),
        ]);
        if (cancelled) return;
        setBranches(br);
        setProducts(catalog);
        setInventory(inv);
        const bm = branchesToMap(br);

        if (editId) {
          setTransferId(editId);
          const tr = await getTransfer(tenantSlug, editId);
          if (cancelled) return;
          const st = (tr.status ?? "").toLowerCase();
          if (st !== "draft" && st !== "confirmed") {
            router.replace(inventoryTransferDetailPath(editId));
            return;
          }
          applyTransferDto(tr, bm, inv);
        } else if (br[0]) {
          const activeBranchId = getEffectiveClientBranchId();
          const sourceBranch =
            (activeBranchId && br.find((b) => b.id === activeBranchId)?.id) ??
            br[0].id;
          setSourceId(sourceBranch);
          const firstDestination = br.find((b) => b.id !== sourceBranch)?.id ?? sourceBranch;
          setDestId(firstDestination);
          const availMap = availabilityByProduct(sourceBranch, inv);
          const firstP = catalog.find((p) => (availMap.get(p.id) ?? 0) > 0) ?? catalog[0] ?? null;
          setLines(
            firstP
              ? [newLine(firstP, availMap.get(firstP.id) ?? 0)]
              : [],
          );
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load form data");
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, editId, router]);

  const availMap = useMemo(
    () => availabilityByProduct(sourceId || undefined, inventory),
    [sourceId, inventory],
  );

  useEffect(() => {
    setLines((prev) =>
      prev.map((row) => ({
        ...row,
        available: row.productId ? availMap.get(row.productId) ?? 0 : 0,
      })),
    );
  }, [availMap]);

  const sameBranch = Boolean(sourceId && destId && sourceId === destId);

  const totalUnits = useMemo(
    () => lines.reduce((s, l) => s + l.quantity, 0),
    [lines],
  );

  const hasStockError = useMemo(
    () => lines.some((l) => l.productId && l.quantity > l.available),
    [lines],
  );

  const sourceLabel =
    branches.find((b) => b.id === sourceId)?.name ?? sourceId;
  const destLabel = branches.find((b) => b.id === destId)?.name ?? destId;

  const updateQty = (key: string, raw: string) => {
    const numeric = Math.max(0, Math.floor(Number(raw) || 0));
    setLines((prev) =>
      prev.map((l) => {
        if (l.clientKey !== key) return l;
        const clamped = l.productId ? Math.min(numeric, Math.max(0, l.available)) : 0;
        return { ...l, quantity: clamped };
      }),
    );
  };

  const setRowProduct = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLines((prev) =>
      prev.map((l) =>
        l.clientKey === key
          ? {
              ...l,
              productId,
              productName: p?.name?.trim() || "Product",
              sku: p?.sku?.trim() || "—",
              unit: p?.unit?.trim() || "—",
              available: availMap.get(productId) ?? 0,
              quantity: Math.min(l.quantity || 1, Math.max(0, availMap.get(productId) ?? 0)),
            }
          : l,
      ),
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.clientKey !== key));
  };

  const addLine = () => {
    const p = products.find((item) => (availMap.get(item.id) ?? 0) > 0) ?? products[0] ?? null;
    setLines((prev) => [...prev, newLine(p, p ? availMap.get(p.id) ?? 0 : 0)]);
  };

  const buildPayloadItems = () =>
    lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => ({ productId: l.productId, quantity: l.quantity }));

  const persistDraft = async (): Promise<string | null> => {
    if (!tenantSlug || !sourceId || !destId) return null;
    const items = buildPayloadItems();
    const validated = validateForSubmit(createTransferDraftSchema, {
      toBranchId: destId,
      items,
    });
    if (!validated.ok) {
      toast.error(validated.message);
      return null;
    }
    if (transferId) {
      await updateTransfer(tenantSlug, transferId, {
        toBranchId: validated.data.toBranchId,
        items: validated.data.items,
      });
      return transferId;
    }
    const created = await createTransfer(tenantSlug, {
      toBranchId: validated.data.toBranchId,
      items: validated.data.items,
    });
    setTransferId(created.id);
    return created.id;
  };

  const saveDraft = async () => {
    if (sameBranch) {
      toast.error("Source and destination must differ.");
      return;
    }
    if (!tenantSlug) return;
    setSaving(true);
    try {
      const id = await persistDraft();
      if (id) toast.success("Draft saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmOrder = async () => {
    if (sameBranch) {
      toast.error("Source and destination must differ.");
      return;
    }
    if (hasStockError) {
      toast.error("Fix quantities that exceed available stock.");
      return;
    }
    if (!tenantSlug) return;
    setSaving(true);
    try {
      const id = await persistDraft();
      if (!id) return;
      await confirmTransfer(tenantSlug, id);
      toast.success("Order confirmed.");
      router.push(inventoryTransferDetailPath(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setSaving(false);
    }
  };

  if (!tenantSlug) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Sign in with a tenant to create transfers.
      </p>
    );
  }

  if (bootLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Draft Phase
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {transferId ? transferId.slice(0, 12) : "New"}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {editId ? "Edit stock transfer" : "New stock transfer"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="rounded-xl" asChild disabled={saving}>
            <Link href={ROUTES.inventory.transfers}>Cancel</Link>
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save as Draft
          </Button>
          <Button
            className="rounded-xl shadow-md shadow-primary/20"
            type="button"
            onClick={() => void confirmOrder()}
            disabled={saving}
          >
            <span>Confirm order</span>
            <CheckCircle2 className="ml-2 size-4" />
          </Button>
        </div>
      </div>

      <Stepper step={1} />

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 space-y-8 lg:col-span-8">
          <Card className="rounded-2xl border-primary/10 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="size-5 text-primary" />
                Transfer Nodes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-2">
              <div className="grid gap-8 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                    Source Branch
                  </Label>
                  <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm font-medium">
                    {sourceLabel || "Active branch"}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Derived from your active branch and validated server-side
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                    Destination Branch
                  </Label>
                  <Select value={destId} onValueChange={setDestId}>
                    <SelectTrigger className="rounded-xl border-transparent bg-muted/40">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id} disabled={b.id === sourceId}>
                          {b.name ?? b.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sameBranch ? (
                    <p className="text-[10px] font-bold uppercase text-destructive">
                      Branches cannot be identical
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-primary/10 shadow-sm">
            <CardHeader className="border-b bg-card pb-4">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Pill className="size-5 text-primary" />
                  Inventory Items
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs font-bold uppercase tracking-widest text-primary"
                  type="button"
                  onClick={addLine}
                  disabled={products.length === 0}
                >
                  <PlusCircle className="size-4" />
                  Add Product
                </Button>
              </div>
              <CardDescription>
                Quantities cannot exceed available stock at the source branch.
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest sm:px-8">
                      Product
                    </TableHead>
                    <TableHead className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest sm:px-8">
                      Available
                    </TableHead>
                    <TableHead className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest sm:px-8">
                      Qty
                    </TableHead>
                    <TableHead className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest sm:px-8">
                      Unit
                    </TableHead>
                    <TableHead className="w-12 px-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="px-8 py-8 text-center text-sm text-muted-foreground"
                      >
                        No products. Add a line or load catalog.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => {
                      const over =
                        Boolean(line.productId) && line.quantity > line.available;
                      return (
                        <TableRow
                          key={line.clientKey}
                          className={cn(
                            "group transition-colors hover:bg-primary/5",
                            over && "bg-destructive/5 hover:bg-destructive/10",
                          )}
                        >
                          <TableCell className="min-w-[200px] px-4 py-5 sm:px-8">
                            <Select
                              value={line.productId || undefined}
                              onValueChange={(v) =>
                                setRowProduct(line.clientKey, v)
                              }
                            >
                              <SelectTrigger className="h-auto min-h-9 rounded-lg border-transparent bg-muted/30 text-left">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {products.map((p) => (
                                  <SelectItem
                                    key={p.id}
                                    value={p.id}
                                    disabled={(availMap.get(p.id) ?? 0) <= 0}
                                  >
                                    {p.name}
                                    {p.sku ? ` · ${p.sku}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="px-4 py-5 font-medium sm:px-8">
                            {line.available.toLocaleString()}
                          </TableCell>
                          <TableCell className="px-4 py-5 sm:px-8">
                            <div className="space-y-1">
                              <Input
                                type="number"
                                min={0}
                                max={Math.max(0, line.available)}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateQty(line.clientKey, e.target.value)
                                }
                                className={cn(
                                  "w-24 rounded-lg sm:w-28",
                                  over &&
                                    "border-destructive text-destructive focus-visible:ring-destructive/30",
                                )}
                                disabled={!line.productId || line.available <= 0}
                              />
                              {over ? (
                                <div className="text-[9px] font-black uppercase text-destructive">
                                  Exceeds stock
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-5 sm:px-8">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              {line.unit}
                            </span>
                          </TableCell>
                          <TableCell className="px-2 py-5 text-right">
                            {over ? (
                              <AlertCircle className="ml-auto size-5 text-destructive" />
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                                type="button"
                                onClick={() => removeLine(line.clientKey)}
                                aria-label="Remove line"
                              >
                                <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        <div className="col-span-12 space-y-8 lg:col-span-4">
          <Card className="rounded-2xl border-0 bg-slate-900 text-slate-50 shadow-xl dark:bg-slate-950">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-primary opacity-90">
                Journal Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-[11px] leading-relaxed text-slate-500">
                Postings on <span className="text-slate-300">ship</span> and{" "}
                <span className="text-slate-300">receive</span> are created by the API when those
                transitions run.
              </p>
              <div className="relative space-y-6 pl-2">
                <div className="absolute bottom-4 left-[15px] top-4 w-px bg-white/10" />
                <div className="relative pl-8">
                  <div className="absolute left-2 top-2 size-2 rounded-full bg-primary ring-4 ring-slate-900" />
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Debit
                    </span>
                    <span className="font-semibold tabular-nums text-lg">—</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Posted on ship / receive per backend rules
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {sourceLabel} → {destLabel}
                  </p>
                </div>
                <div className="relative pl-8">
                  <div className="absolute left-2 top-2 size-2 rounded-full bg-red-500 ring-4 ring-slate-900" />
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Credit
                    </span>
                    <span className="font-semibold tabular-nums text-lg">—</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Posted on ship / receive per backend rules
                  </p>
                </div>
              </div>
              <div className="space-y-4 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Total Items
                  </span>
                  <span className="text-sm font-bold">
                    {totalUnits.toLocaleString()} Units
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-primary/10 shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-border py-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Priority
                </span>
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  <Bolt className="size-3" />
                  Standard
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <div className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Info className="size-5" />
              </div>
              <div>
                <h4 className="mb-1 text-sm font-bold">Internal Transfer Policy</h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Draft and confirmed orders do not move stock by themselves on this screen.
                  Shipping locks the transfer; the destination receives from Incoming transfers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
