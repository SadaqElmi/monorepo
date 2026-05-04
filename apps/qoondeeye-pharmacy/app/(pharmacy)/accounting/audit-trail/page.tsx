"use client";

import * as React from "react";
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
import { getAuditTrail, type AuditLogRow } from "@/lib/services/accounting";

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

export default function AuditTrailPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState<number>(200);
  const [rows, setRows] = React.useState<AuditLogRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

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

  const load = React.useCallback(async () => {
    if (!branchId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getAuditTrail(tenantSlug, branchId, limit);
      setRows(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load audit trail");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId, limit]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
              <Label>Rows</Label>
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
              onClick={() => void load()}
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
