"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { getResolvedStoredUser } from "@/lib/auth-client";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { getAuditTrailPaged } from "@/lib/services/accounting";
import { ROUTES } from "@/lib/routes";

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

function formatAuditActor(row: {
  actor_name?: string | null;
  actor_user_id?: string | null;
}): string {
  const name = row.actor_name?.trim();
  if (name) return name;
  return row.actor_user_id ? "Unknown user" : "System";
}

function formatAuditRecordLabel(row: {
  record_label?: string | null;
  record_id?: string;
  table_name?: string;
  action?: string;
}): string {
  const label = row.record_label?.trim();
  if (label) return label;
  if (row.table_name && row.action) {
    return `${row.table_name} · ${row.action}`;
  }
  return "—";
}

export default function AuditTrailPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [tenantSlug] = React.useState(
    () => getResolvedStoredUser()?.tenantSlug?.trim() ?? "",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [branchFacet, setBranchFacet] = React.useState(() =>
    typeof window !== "undefined" ? getBranchQueryKeyFacet() : "",
  );
  const [limit, setLimit] = React.useState<number>(50);
  const [page, setPage] = React.useState(1);
  const [tableName, setTableName] = React.useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const params = new URLSearchParams(window.location.search);
    return params.get("table") === "pos_auth" ? "pos_auth" : "all";
  });

  React.useEffect(() => {
    if (searchParams.get("table") === "pos_auth") {
      setTableName("pos_auth");
    }
  }, [searchParams]);

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
  }, [limit, branchId, tableName]);

  const auditQuery = useQuery({
    queryKey: [
      "erp",
      "audit-trail",
      tenantSlug,
      branchId,
      branchFacet,
      page,
      limit,
      tableName,
    ],
    enabled: Boolean(branchId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      getAuditTrailPaged(tenantSlug, branchId!, page, limit, {
        signal,
        tableName: tableName === "pos_auth" ? "pos_auth" : undefined,
      }),
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
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Audit trail</CardTitle>
            <CardDescription>
              Recent changes recorded in audit logs for this branch (and global
              rows where applicable).
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.configuration.posAudit}>POS audit log</Link>
          </Button>
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
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={tableName} onValueChange={setTableName}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tables</SelectItem>
                  <SelectItem value="pos_auth">POS auth only</SelectItem>
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
                      <TableCell
                        className="text-xs"
                        title={r.record_label ? r.record_id : undefined}
                      >
                        {formatAuditRecordLabel(r)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatAuditActor(r)}
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
