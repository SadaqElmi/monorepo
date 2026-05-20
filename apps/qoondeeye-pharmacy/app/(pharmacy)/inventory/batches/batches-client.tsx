"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Layers,
  Loader2,
  Package,
  Search,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStoredUser } from "@/lib/auth-client";
import { useErpProducts } from "@/hooks/queries/use-erp-products";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { getBatches, type Batch, type Product } from "@/lib/api";

type BatchStatusFilter = "all" | "active" | "expiring_soon" | "expired";

const EXPIRING_SOON_DAYS = 90;

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
}

function isExpired(expiryDate: string | null | undefined) {
  if (!expiryDate) return false;
  const d = new Date(expiryDate);
  if (!Number.isFinite(d.getTime())) return false;
  const today = new Date();
  const todayNoTime = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const expiryNoTime = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return expiryNoTime.getTime() < todayNoTime.getTime();
}

function isExpiringSoon(expiryDate: string | null | undefined) {
  if (!expiryDate || isExpired(expiryDate)) return false;
  const d = new Date(expiryDate);
  if (!Number.isFinite(d.getTime())) return false;
  const today = new Date();
  const todayNoTime = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const expiryNoTime = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays =
    (expiryNoTime.getTime() - todayNoTime.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= EXPIRING_SOON_DAYS;
}

function batchStatus(batch: Batch): {
  label: string;
  variant: "active" | "expiring_soon" | "expired";
} {
  if (isExpired(batch.expiry_date)) {
    return { label: "Expired", variant: "expired" };
  }
  if (isExpiringSoon(batch.expiry_date)) {
    return { label: "Expiring Soon", variant: "expiring_soon" };
  }
  const qty = batch.quantity ?? 0;
  if (qty <= 0) {
    return { label: "Out of stock", variant: "expiring_soon" };
  }
  return { label: "Active", variant: "active" };
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: "amber" | "red" | "emerald";
  icon: ComponentType<{ className?: string }>;
}) {
  const Icon = icon;
  const borderClass =
    accent === "amber"
      ? "border-l-4 border-l-amber-500"
      : accent === "red"
        ? "border-l-4 border-l-red-500"
        : "";
  const valueClass =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "red"
          ? "text-red-600 dark:text-red-400"
          : "";
  return (
    <Card className={`rounded-xl border bg-card shadow-sm ${borderClass}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <h3 className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</h3>
          </div>
          <div className="rounded-lg bg-muted/50 p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export type BatchesPageClientProps = {
  initialBatches?: Batch[] | null;
  initialProducts?: Product[] | null;
  serverPrefetched?: boolean;
};

export default function BatchesPage({
  initialBatches = null,
  initialProducts = null,
  serverPrefetched = false,
}: BatchesPageClientProps = {}) {
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const batchesQuery = useQuery({
    queryKey: erpKeys.batches(tenantSlug, branchFacet),
    queryFn: () => getBatches(tenantSlug),
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialBatches ? initialBatches : undefined,
  });
  const productsQuery = useErpProducts(tenantSlug, {
    initialData:
      serverPrefetched && initialProducts ? initialProducts : undefined,
  });
  const batches = batchesQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const loading = batchesQuery.isPending || productsQuery.isPending;
  const loadError = batchesQuery.error ?? productsQuery.error;
  const displayError =
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load batches"
        : null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BatchStatusFilter>("all");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewBatch, setViewBatch] = useState<Batch | null>(null);

  const pageSize = 10;
  const [page, setPage] = useState(1);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filteredBatches = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = [...batches].filter((b) => {
      if (statusFilter === "active") {
        const status = batchStatus(b);
        if (status.variant !== "active") return false;
      } else if (statusFilter === "expiring_soon") {
        const status = batchStatus(b);
        if (status.variant !== "expiring_soon") return false;
      } else if (statusFilter === "expired") {
        const status = batchStatus(b);
        if (status.variant !== "expired") return false;
      }

      if (!q) return true;

      const product = productMap.get(b.product_id ?? "");
      const strengthForm = [
        product?.strength ?? undefined,
        product?.formulation ?? undefined,
      ]
        .filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0,
        )
        .join(" · ");
      const haystack = [
        product?.name,
        strengthForm || undefined,
        product?.sku ?? undefined,
        b.batch_number ?? undefined,
        b.expiry_date ?? undefined,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return list.sort((a, b) => {
      if (!a.expiry_date && !b.expiry_date) return 0;
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    });
  }, [batches, productMap, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / pageSize));
  const pagedBatches = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBatches.slice(start, start + pageSize);
  }, [filteredBatches, page]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const stats = useMemo(() => {
    const total = batches.length;
    const expired = batches.filter((b) => isExpired(b.expiry_date)).length;
    const expiringSoon = batches.filter(
      (b) => !isExpired(b.expiry_date) && isExpiringSoon(b.expiry_date),
    ).length;
    const active = batches.filter((b) => {
      if (isExpired(b.expiry_date)) return false;
      return (b.quantity ?? 0) > 0;
    }).length;
    return { total, active, expiringSoon, expired };
  }, [batches]);

  const downloadCsv = () => {
    const escapeCell = (value: unknown) => {
      const s = String(value ?? "");
      if (s.includes('"') || s.includes(",") || s.includes("\n"))
        return `"${s.replaceAll('"', '""')}"`;
      return s;
    };
    const header = [
      "Batch Number",
      "Product Name",
      "Quantity",
      "Cost Price",
      "Selling Price",
      "Expiry Date",
      "Status",
    ];
    const rows = filteredBatches.map((b) => {
      const product = productMap.get(b.product_id ?? "");
      const status = batchStatus(b);
      return [
        b.batch_number ?? "",
        product?.name ?? "—",
        b.quantity ?? 0,
        b.cost_price ?? "",
        b.selling_price ?? "",
        formatDate(b.expiry_date),
        status.label,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batches_${tenantSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showingStart =
    filteredBatches.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredBatches.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-6 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative w-64 max-w-[32vw] hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search batches, products..."
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-lg"
            onClick={downloadCsv}
            disabled={filteredBatches.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </header>

      <main className="flex-1 p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Medicine Batches
              </h1>
              <p className="mt-1 max-w-xl text-base text-muted-foreground">
                Read-only lot register. New batches are created when you post a
                purchase with line items; quantities change when you sell or
                return stock.
              </p>
            </div>
            <div className="flex gap-2 md:hidden">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-lg"
                onClick={downloadCsv}
                disabled={filteredBatches.length === 0}
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Batches"
              value={stats.total.toLocaleString()}
              icon={Layers}
            />
            <StatCard
              label="Active Stock"
              value={stats.active.toLocaleString()}
              accent="emerald"
              icon={CheckCircle2}
            />
            <StatCard
              label="Expiring Soon"
              value={stats.expiringSoon.toLocaleString()}
              accent="amber"
              icon={AlertTriangle}
            />
            <StatCard
              label="Expired Items"
              value={stats.expired.toLocaleString()}
              accent="red"
              icon={XCircle}
            />
          </div>

          {displayError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {displayError}
            </div>
          ) : null}

          <Card className="overflow-hidden rounded-xl border shadow-sm">
            <CardHeader className="border-b bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search batches, products, or suppliers..."
                    className="h-9 rounded-lg border bg-background pl-9 md:min-w-[300px]"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as BatchStatusFilter);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-[160px] rounded-lg border">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              {!tenantSlug ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Set tenant to load batches.
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading batches…
                </div>
              ) : pagedBatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
                  <Package className="h-10 w-10 text-muted-foreground/50" />
                  <p>No batches match your filters.</p>
                  <p className="max-w-md text-xs">
                    Batches appear after you record a purchase for products. Use
                    Purchases to receive stock.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Batch Number
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Product Name
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Quantity
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Cost Price
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Selling Price
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Expiry Date
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="w-[72px] text-center font-semibold uppercase tracking-wider text-muted-foreground">
                        View
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedBatches.map((b) => {
                      const product = productMap.get(b.product_id ?? "");
                      const strengthForm = [
                        product?.strength ?? undefined,
                        product?.formulation ?? undefined,
                      ]
                        .filter(
                          (v): v is string =>
                            typeof v === "string" && v.trim().length > 0,
                        )
                        .join(" · ");
                      const status = batchStatus(b);

                      return (
                        <TableRow
                          key={b.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <TableCell className="font-mono text-sm font-medium">
                            {b.batch_number ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="text-sm font-semibold text-primary">
                                {product?.name ?? "Unassigned product"}
                              </div>
                              <div className="text-xs uppercase text-muted-foreground">
                                {strengthForm || "—"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {(b.quantity ?? 0).toLocaleString()}
                            <span className="ml-1 text-xs text-muted-foreground">
                              units
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatMoney(b.cost_price)}
                          </TableCell>
                          <TableCell className="text-sm font-semibold">
                            {formatMoney(b.selling_price)}
                          </TableCell>
                          <TableCell
                            className={`text-sm ${
                              status.variant === "expired"
                                ? "font-semibold text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatDate(b.expiry_date)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                status.variant === "active"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0"
                                  : status.variant === "expiring_soon"
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0"
                              }
                            >
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                              title="View batch details"
                              onClick={() => {
                                setViewBatch(b);
                                setViewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {filteredBatches.length > 0 && (
              <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Showing {showingStart} to {showingEnd} of{" "}
                  {filteredBatches.length} batches
                </p>
                <div className="flex items-center gap-1">
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
                    if (end - start + 1 < show)
                      start = Math.max(1, end - show + 1);
                    return Array.from(
                      { length: end - start + 1 },
                      (_, i) => start + i,
                    ).map((p) => (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8 rounded-lg text-xs font-medium"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ));
                  })()}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </main>

      <Sheet
        open={viewOpen}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) setViewBatch(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Batch details</SheetTitle>
            <SheetDescription>
              Read-only. To add stock, record a purchase; sales and returns
              update quantities.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto p-4">
            {!viewBatch ? (
              <p className="text-sm text-muted-foreground">
                No batch selected.
              </p>
            ) : (
              (() => {
                const product = productMap.get(viewBatch.product_id ?? "");
                const status = batchStatus(viewBatch);
                const strengthForm = [
                  product?.strength ?? undefined,
                  product?.formulation ?? undefined,
                ]
                  .filter(
                    (v): v is string =>
                      typeof v === "string" && v.trim().length > 0,
                  )
                  .join(" · ");

                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Product
                      </p>
                      <p className="text-sm font-semibold">
                        {product?.name ?? "Unassigned product"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {strengthForm || "—"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Batch number
                        </p>
                        <p className="text-sm font-mono">
                          {viewBatch.batch_number ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Expiry date
                        </p>
                        <p className="text-sm">
                          {formatDate(viewBatch.expiry_date)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Quantity
                        </p>
                        <p className="text-sm font-semibold">
                          {(viewBatch.quantity ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Status
                        </p>
                        <Badge
                          variant="secondary"
                          className={
                            status.variant === "active"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 mt-1"
                              : status.variant === "expiring_soon"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 mt-1"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 mt-1"
                          }
                        >
                          {status.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Cost price
                        </p>
                        <p className="text-sm">
                          {formatMoney(viewBatch.cost_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Selling price
                        </p>
                        <p className="text-sm">
                          {formatMoney(viewBatch.selling_price)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
