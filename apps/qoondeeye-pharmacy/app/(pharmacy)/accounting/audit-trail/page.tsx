"use client";

import * as React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { getAuditTrailPaged } from "@/lib/services/accounting";

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

export default function AuditTrailPage() {
  const queryClient = useQueryClient();
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [branchFacet, setBranchFacet] = React.useState(() =>
    typeof window !== "undefined" ? getBranchQueryKeyFacet() : "",
  );
  const [limit, setLimit] = React.useState<number>(50);
  const [page, setPage] = React.useState(1);

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

  React.useEffect(() => {
    setBranchFacet(getBranchQueryKeyFacet());
  }, [branchId]);

  React.useEffect(() => {
    const sync = () => setBranchFacet(getBranchQueryKeyFacet());
    window.addEventListener("storage", sync);
    window.addEventListener("activeBranchChanged", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(
        "activeBranchChanged",
        sync as EventListener,
      );
    };
  }, []);

  React.useEffect(() => {
    setPage(1);
  }, [limit, branchId]);

  const auditQuery = useQuery({
    queryKey: [
      "erp",
      "audit-trail",
      tenantSlug,
      branchId,
      branchFacet,
      page,
      limit,
    ],
    enabled: Boolean(branchId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      getAuditTrailPaged(tenantSlug, branchId!, page, limit, { signal }),
  });

  const rows = auditQuery.data?.items ?? [];
  const totalPages = auditQuery.data?.totalPages ?? 1;
  const totalRows = auditQuery.data?.total ?? 0;
  const loading = auditQuery.isFetching;
  const err = auditQuery.error
    ? auditQuery.error instanceof Error
      ? auditQuery.error.message
      : "Failed to load audit trail"
    : null;

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}
      {!branchId ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          A specific branch is required for the audit trail API.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>
            Recent changes recorded in audit logs for this branch (and global
            rows where applicable).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label>Page size</Label>
              <Select
                value={String(limit)}
                onValueChange={(v) => setLimit(Number(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={loading || !branchId}
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["erp", "audit-trail"],
                })
              }
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Refresh
            </Button>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} ({totalRows.toLocaleString()} rows)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>

          {loading && !rows.length ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !branchId ? null : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit rows.</p>
          ) : (
            <div className="max-h-[min(70vh,720px)] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.action}</TableCell>
                      <TableCell className="text-xs">{r.table_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.record_id?.slice(0, 12)}…
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.actor_user_id?.slice(0, 8) ?? "—"}
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
