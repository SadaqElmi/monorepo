"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { Loader2 } from "lucide-react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  getJournalLines,
  type JournalLineFlatRow,
} from "@/lib/services/accounting";

function numFromLedger(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function JournalLinesPage() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");
  const monthAgo = format(subMonths(new Date(), 1), "yyyy-MM-dd");
  const [from, setFrom] = React.useState(monthAgo);
  const [to, setTo] = React.useState(today);
  const [localErr, setLocalErr] = React.useState<string | null>(null);
  const lineParams = React.useMemo(
    () => ({ from, to, limit: 1000 }),
    [from, to],
  );

  const syncBranch = React.useCallback(() => {
    try {
      const v = localStorage.getItem("branchId");
      const t = v?.trim();
      setBranchId(t && t !== "all" ? t : null);
    } catch {
      setBranchId(null);
    }
  }, []);

  React.useEffect(() => {
    syncBranch();
    const onBranch = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { branchId?: string | null };
      if (detail?.branchId) setBranchId(detail.branchId);
      else syncBranch();
    };
    window.addEventListener("storage", () => syncBranch());
    window.addEventListener("activeBranchChanged", onBranch as EventListener);
    return () => {
      window.removeEventListener("activeBranchChanged", onBranch as EventListener);
    };
  }, [syncBranch]);

  const linesQuery = useQuery({
    queryKey: erpKeys.journalLines(
      tenantSlug,
      branchFacet,
      branchId ?? "",
      lineParams,
    ),
    queryFn: () => getJournalLines(tenantSlug, branchId!, lineParams),
    enabled: Boolean(tenantSlug && branchId),
    staleTime: ERP_STALE_LIST,
  });
  const rows = linesQuery.data ?? [];
  const loading = linesQuery.isPending;
  const loadError = linesQuery.error;
  const err =
    localErr ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load journal lines"
        : null);

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}
      {!branchId ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Select a branch (set <strong>branchId</strong> in local storage) to
          load journal lines.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Journal items</CardTitle>
          <CardDescription>
            Posted debit and credit lines from all journal entries in the date
            range (newest entries first).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="jl-from">From</Label>
              <Input
                id="jl-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[148px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jl-to">To</Label>
              <Input
                id="jl-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[148px]"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={loading || !branchId}
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["erp", "journal-lines"],
                })
              }
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Refresh
            </Button>
          </div>

          {loading && !rows.length ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !branchId ? null : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines in range.</p>
          ) : (
            <div className="max-h-[min(70vh,720px)] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line_id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.entry_date}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate text-sm font-medium">
                          {r.account_name ?? "—"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.account_key ?? r.account_id.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.source_type}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.partner_kind && r.partner_id
                          ? `${r.partner_kind}: ${r.partner_id.slice(0, 8)}…`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {numFromLedger(r.debit) > 0
                          ? money(numFromLedger(r.debit))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {numFromLedger(r.credit) > 0
                          ? money(numFromLedger(r.credit))
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
