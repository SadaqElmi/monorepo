"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { History, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_HISTORY, ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { ROUTES, inventoryTransferDetailPath } from "@/lib/routes";
import { getBranches } from "@/lib/services/branches";
import {
  getInventoryHistoryPaged,
  type InventoryHistoryRow,
} from "@/lib/services/inventory-history";
import { getProductsCatalog } from "@/lib/services/products";

const PAGE_SIZE = 25;
const ALL_BRANCHES = "all";
/** Non-empty sentinels — Radix Select forbids `value=""` on SelectItem. */
const ALL_PRODUCTS = "all";
const ALL_ACTIONS = "all";

const ACTION_LABELS: Record<string, string> = {
  sale: "Sale",
  purchase: "Purchase",
  return: "Return",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  transfer_reversal: "Transfer reversal",
  adjustment: "Adjustment",
  reconciliation: "Reconciliation",
  expired_removal: "Expired removal",
  damage: "Damage",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function referenceLink(row: InventoryHistoryRow): ReactNode {
  const short =
    row.reference_id.length > 8
      ? `${row.reference_id.slice(0, 8)}…`
      : row.reference_id;
  if (row.reference_type === "stock_transfer") {
    return (
      <Link
        href={inventoryTransferDetailPath(row.reference_id)}
        className="text-primary underline-offset-4 hover:underline"
      >
        Transfer {row.ref_hint ?? short}
      </Link>
    );
  }
  const label =
    row.reference_type === "sale"
      ? `Sale ${row.ref_hint ?? short}`
      : row.reference_type === "purchase"
        ? `Purchase ${row.ref_hint ?? short}`
        : row.reference_type === "sale_return"
          ? `Return ${short}`
          : `${row.reference_type} ${short}`;
  return <span className="text-muted-foreground">{label}</span>;
}

export default function InventoryHistoryPage() {
  const [tenantSlug] = useState(() => getStoredUser()?.tenantSlug?.trim() ?? null);
  const [branchFacet, setBranchFacet] = useState(() =>
    typeof window !== "undefined" ? getBranchQueryKeyFacet() : "",
  );
  const [page, setPage] = useState(1);
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [productFilter, setProductFilter] = useState<string>(ALL_PRODUCTS);
  const [actionFilter, setActionFilter] = useState<string>(ALL_ACTIONS);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const sync = () => setBranchFacet(getBranchQueryKeyFacet());
    window.addEventListener("storage", sync);
    window.addEventListener("activeBranchChanged", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("activeBranchChanged", sync as EventListener);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtersKey = useMemo(
    () => ({
      branchFilter,
      productFilter,
      actionFilter,
      startDate,
      endDate,
      debouncedSearch,
    }),
    [
      branchFilter,
      productFilter,
      actionFilter,
      startDate,
      endDate,
      debouncedSearch,
    ],
  );

  useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  const branchesQuery = useQuery({
    queryKey: erpKeys.branches(tenantSlug!, branchFacet),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    queryFn: ({ signal }) => getBranches(tenantSlug!, { signal }),
  });

  const productsCatalogQuery = useQuery({
    queryKey: erpKeys.productsCatalog(tenantSlug!, branchFacet),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    queryFn: ({ signal }) => getProductsCatalog(tenantSlug!, { signal }),
  });

  const historyQuery = useQuery({
    queryKey: erpKeys.inventoryHistory(
      tenantSlug!,
      branchFacet,
      page,
      PAGE_SIZE,
      filtersKey,
    ),
    enabled: Boolean(tenantSlug && branchFacet),
    placeholderData: keepPreviousData,
    retry: 2,
    staleTime: ERP_STALE_HISTORY,
    queryFn: ({ signal }) =>
      getInventoryHistoryPaged(
        tenantSlug!,
        {
          page,
          limit: PAGE_SIZE,
          branch_id:
            branchFilter !== ALL_BRANCHES ? branchFilter : undefined,
          product_id:
            productFilter !== ALL_PRODUCTS ? productFilter : undefined,
          action_type:
            actionFilter !== ALL_ACTIONS ? actionFilter : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          search: debouncedSearch || undefined,
        },
        { signal },
      ),
  });

  const loading =
    historyQuery.isPending ||
    historyQuery.isFetching ||
    branchesQuery.isFetching ||
    productsCatalogQuery.isFetching;
  const err = historyQuery.error
    ? historyQuery.error instanceof Error
      ? historyQuery.error.message
      : "Failed to load inventory history"
    : null;

  const rows = historyQuery.data?.items ?? [];
  const totalPages = Math.max(1, historyQuery.data?.totalPages ?? 1);
  const branchOptions = useMemo(() => {
    const br = branchesQuery.data ?? [];
    return [...br]
      .map((b) => [b.id, b.name ?? b.id] as [string, string])
      .sort((a, b) =>
        a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
      );
  }, [branchesQuery.data]);

  const productOptions = useMemo(() => {
    const pr = productsCatalogQuery.data ?? [];
    return [...pr].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, {
        sensitivity: "base",
      }),
    );
  }, [productsCatalogQuery.data]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  if (!tenantSlug && !loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sign in with a tenant to view inventory history.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
        <History className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            Inventory history
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Stock movements across sales, purchases, returns, and transfers
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>
              Scoped to your branch access. Narrow by branch, product, dates, or
              search.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="branch-filter">Branch</Label>
                <Select
                  value={branchFilter}
                  onValueChange={setBranchFilter}
                  disabled={loading}
                >
                  <SelectTrigger id="branch-filter">
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                    {branchOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-filter">Product</Label>
                <Select
                  value={productFilter}
                  onValueChange={setProductFilter}
                  disabled={loading}
                >
                  <SelectTrigger id="product-filter">
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={ALL_PRODUCTS}>All products</SelectItem>
                    {productOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name ?? p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="action-filter">Action</Label>
                <Select
                  value={actionFilter}
                  onValueChange={setActionFilter}
                  disabled={loading}
                >
                  <SelectTrigger id="action-filter">
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
                    {Object.entries(ACTION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Product, barcode, batch, ref…"
                    className="pl-9"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-date">From date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">To date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 flex-1">
          <CardContent className="p-0">
            {err ? (
              <div className="p-8 text-center text-sm text-destructive">
                {err}
              </div>
            ) : loading && !historyQuery.data ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Loading history…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No movements match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Qty Δ</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {format(
                            new Date(row.created_at),
                            "yyyy-MM-dd HH:mm",
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {row.product_name ?? row.product_id ?? "—"}
                        </TableCell>
                        <TableCell>{formatAction(row.action_type)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity_change > 0 ? "+" : ""}
                          {row.quantity_change}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          —
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          —
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {row.branch_name ?? row.branch_id ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate">
                          {row.performed_by?.name ??
                            row.performed_by?.user_id ??
                            "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          {referenceLink(row)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {historyQuery.data && rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Page {historyQuery.data.page} of {totalPages} ·{" "}
              {historyQuery.data.total} rows
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Before/after quantities are not stored per movement in v1; a future ledger
          will add running balances.{" "}
          <Link href={ROUTES.inventory.stock} className="text-primary underline-offset-4 hover:underline">
            Stock levels
          </Link>{" "}
          reflect current on-hand totals.
        </p>
      </div>
    </div>
  );
}
