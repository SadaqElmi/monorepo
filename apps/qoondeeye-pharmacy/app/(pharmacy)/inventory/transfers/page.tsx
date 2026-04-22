"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Download,
  Filter,
  Loader2,
  Package,
  PlusCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { TransferKpiCards } from "@/components/features/stock-transfers/transfer-kpi-cards";
import {
  branchesToMap,
  transferDtoToListRow,
} from "@/components/features/stock-transfers/transfer-mappers";
import type { StockTransferListRow } from "@/components/features/stock-transfers/types";
import { TransfersTable } from "@/components/features/stock-transfers/transfers-table";
import {
  canEditTransferLimited,
  isTransferLocked,
} from "@/components/features/stock-transfers/transfer-rules";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { Input } from "@repo/ui/input";
import { getStoredUser } from "@/lib/auth-client";
import { getBranches } from "@/lib/services/branches";
import { listTransfers } from "@/lib/services/transfers";
import { ROUTES } from "@/lib/routes";
import { toast } from "sonner";

const PAGE_SIZE = 10;

const ALL_BRANCHES = "all";
const ALL_STATUSES = "all";

export default function StockTransfersPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<StockTransferListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    const u = getStoredUser();
    const slug = u?.tenantSlug?.trim() ?? null;
    setTenantSlug(slug);
    if (!slug) {
      setLoading(false);
      setAllRows([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [branches, dtos] = await Promise.all([
        getBranches(slug),
        listTransfers(slug),
      ]);
      const bm = branchesToMap(branches);
      setAllRows(dtos.map((d) => transferDtoToListRow(d, bm)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load transfers");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const branchOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) {
      if (r.fromBranchId) map.set(r.fromBranchId, r.fromBranch);
      if (r.toBranchId) map.set(r.toBranchId, r.toBranch);
    }
    return [...map.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
    );
  }, [allRows]);

  const kpis = useMemo(() => {
    const draft = allRows.filter((r) => r.status === "draft").length;
    const confirmed = allRows.filter((r) => r.status === "confirmed").length;
    const shipped = allRows.filter((r) => r.status === "shipped").length;
    const received = allRows.filter((r) => r.status === "received").length;
    return { draft, confirmed, shipped, received };
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (statusFilter !== ALL_STATUSES && r.status !== statusFilter) {
        return false;
      }
      if (branchFilter !== ALL_BRANCHES) {
        const matches =
          r.fromBranchId === branchFilter || r.toBranchId === branchFilter;
        if (!matches) return false;
      }
      if (!q) return true;
      const hay = [
        r.displayId,
        r.fromBranch,
        r.toBranch,
        r.createdByName,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, query, statusFilter, branchFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, branchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const clearFilters = () => {
    setQuery("");
    setStatusFilter(ALL_STATUSES);
    setBranchFilter(ALL_BRANCHES);
  };

  const exportPdf = () => {
    toast.message("Export PDF", { description: "Connect reporting API to export." });
  };

  const onEditClick = (row: StockTransferListRow) => {
    if (isTransferLocked(row.status)) {
      toast.error("Cannot edit", {
        description: `${row.displayId} is locked after ship/receive and remains immutable when closed.`,
      });
      return;
    }
    if (canEditTransferLimited(row.status)) {
      router.push(
        `${ROUTES.inventory.transfersNew}?edit=${encodeURIComponent(row.id)}`,
      );
      return;
    }
    router.push(
      `${ROUTES.inventory.transfersNew}?edit=${encodeURIComponent(row.id)}`,
    );
  };

  if (!tenantSlug && !loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sign in with a tenant to view stock transfers.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by Transfer ID or pharmacist..."
              className="h-9 rounded-full pl-9"
              disabled={loading}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-2 rounded-full sm:inline-flex"
            type="button"
            onClick={exportPdf}
          >
            <Download className="size-4" />
            Export PDF
          </Button>
          <Button
            className="gap-2 rounded-full shadow-md shadow-primary/20"
            size="sm"
            asChild
          >
            <Link href={ROUTES.inventory.transfersNew}>
              <PlusCircle className="size-4" />
              New Transfer
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Stock Transfers
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Draft → confirmed → shipped → received → closed. Stock moves on{" "}
              <strong className="font-medium text-foreground">ship</strong> (out) and{" "}
              <strong className="font-medium text-foreground">receive</strong> (in). Receiving
              branch uses{" "}
              <Link
                href={ROUTES.inventory.transfersIncoming}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Incoming transfers
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:hidden">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href={ROUTES.inventory.transfersNew}>
                <PlusCircle className="size-4" />
                New
              </Link>
            </Button>
          </div>
        </div>

        {loadError ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" type="button" onClick={() => void refresh()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Loading transfers…</span>
          </div>
        ) : (
          <>
            <TransferKpiCards
              drafts={kpis.draft}
              confirmedOrders={kpis.confirmed}
              inTransit={kpis.shipped}
              received={kpis.received}
            />

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-muted-foreground sm:min-w-[120px] sm:flex-none">
                <Filter className="size-4 shrink-0" />
                <span className="hidden sm:inline">Filters</span>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] rounded-xl border-transparent bg-muted/40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[200px] rounded-xl border-transparent bg-muted/40">
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
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-xl"
                type="button"
                aria-label="More filters"
                onClick={() =>
                  toast.message("Filters", { description: "Advanced filters coming soon." })
                }
              >
                <SlidersHorizontal className="size-4" />
              </Button>
              <div className="hidden items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm font-semibold text-muted-foreground sm:flex">
                <CalendarDays className="size-4" />
                <span>Date range</span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <Card className="rounded-3xl border-dashed">
                <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="mb-6 flex size-24 items-center justify-center rounded-full bg-muted/50">
                    <Package className="size-12 text-muted-foreground/50" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold">No transfers found</h3>
                  <p className="mb-8 max-w-sm text-sm text-muted-foreground">
                    We couldn&apos;t find any stock transfers matching your filters.
                    Try adjusting your search or create a new transfer.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" type="button" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                    <Button asChild>
                      <Link href={ROUTES.inventory.transfersNew}>
                        New Transfer
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <TransfersTable
                rows={pagedRows}
                page={page}
                totalPages={totalPages}
                totalCount={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                onEditClick={onEditClick}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
