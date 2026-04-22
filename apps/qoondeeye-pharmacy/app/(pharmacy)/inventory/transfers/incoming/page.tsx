"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Loader2, Package, Search } from "lucide-react";

import {
  branchesToMap,
  transferDtoToListRow,
} from "@/components/features/stock-transfers/transfer-mappers";
import type { StockTransferListRow } from "@/components/features/stock-transfers/types";
import { TransfersTable } from "@/components/features/stock-transfers/transfers-table";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { getStoredUser } from "@/lib/auth-client";
import { getBranches } from "@/lib/services/branches";
import { getClientBranchId } from "@/lib/services/http";
import { listTransfers } from "@/lib/services/transfers";
import { ROUTES } from "@/lib/routes";

const PAGE_SIZE = 10;

export default function IncomingTransfersPage() {
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [rows, setRows] = useState<StockTransferListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    const u = getStoredUser();
    const slug = u?.tenantSlug?.trim() ?? null;
    const bid = getClientBranchId() ?? null;
    setTenantSlug(slug);
    setBranchId(bid);
    if (!slug || !bid) {
      setLoading(false);
      setRows([]);
      setBranchName(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [branches, dtos] = await Promise.all([
        getBranches(slug),
        listTransfers(slug, {
          status: "shipped",
          to_branch_id: bid,
        }),
      ]);
      const bm = branchesToMap(branches);
      setBranchName(bm.get(bid) ?? bid);
      setRows(
        dtos
          .filter((d) => !d.is_reversed)
          .map((d) => transferDtoToListRow(d, bm)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load incoming transfers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.displayId, r.fromBranch, r.createdByName]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search incoming by ID or sender..."
            className="h-9 rounded-full pl-9"
            disabled={loading || !branchId}
          />
        </div>
        <Button variant="outline" size="sm" className="shrink-0 rounded-full" asChild>
          <Link href={ROUTES.inventory.transfers}>All transfers</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Inbox className="size-8 text-primary" />
              Incoming transfers
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              <strong className="text-foreground">Shipped</strong> transfers where{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">to_branch_id</code> matches
              your branch selector (
              <strong className="text-foreground">
                {branchName ?? branchId ?? "not set"}
              </strong>
              ). Post <strong className="text-foreground">Accept / Receive</strong> for stock IN.
            </p>
          </div>
        </div>

        {!tenantSlug && !loading ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Sign in with a tenant to view incoming transfers.
            </CardContent>
          </Card>
        ) : null}

        {!branchId && tenantSlug ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-6 text-sm text-amber-900 dark:text-amber-100">
              Select a specific branch in the app (not &quot;All&quot;) so{" "}
              <code className="rounded bg-background/50 px-1">x-branch-id</code> and this list can
              scope to your receiving location.
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" type="button" onClick={() => void refresh()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Loading incoming…</span>
          </div>
        ) : !branchId ? null : filtered.length === 0 ? (
          <Card className="rounded-3xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-6 flex size-24 items-center justify-center rounded-full bg-muted/50">
                <Package className="size-12 text-muted-foreground/50" />
              </div>
              <h3 className="mb-2 text-xl font-bold">No incoming shipments</h3>
              <p className="mb-6 max-w-md text-sm text-muted-foreground">
                Nothing is in transit to this branch right now, or your search did not match any
                rows.
              </p>
              <Button variant="outline" asChild>
                <Link href={ROUTES.inventory.transfers}>Back to all transfers</Link>
              </Button>
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
            detailLinkReceiver
            showEditAction={false}
          />
        )}
      </main>
    </div>
  );
}
