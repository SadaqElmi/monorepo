"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MoreHorizontal,
  Play,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { getStoredUser, type StoredUser } from "@/lib/auth-client";
import {
  getLatestReconciliationRun,
  getReconciliationLogs,
  runFullReconciliation,
  type ReconciliationLogItem,
  type ReconciliationRunSummary,
} from "@/lib/services/reconciliation";
import {
  recreateMissingTransferJournals,
  repairTransferApprovalFromReplay,
  repairTransferJournalLinks,
} from "@/lib/services/transfer-repair";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m ${rs}s`;
}

function formatBranchScope(scope: ReconciliationRunSummary["branchScope"]): string {
  if (!scope) return "—";
  if (Array.isArray(scope)) {
    if (!scope.length) return "—";
    return scope.join(", ");
  }
  const text = String(scope).trim();
  if (!text) return "—";
  if (text === "all_branches") return "All allowed branches";
  return text;
}

function entityLabel(row: ReconciliationLogItem): string {
  const disp = row.entityDisplay?.trim();
  if (disp) return disp;
  const code = row.entityCode?.trim();
  if (code) return code;
  return entityTypeFallbackLabel(row.type);
}

function entityTypeFallbackLabel(type: string): string {
  const t = (type ?? "").toLowerCase().trim();
  if (t === "transfer" || t === "event") return "Transfer";
  if (t === "journal") return "Journal entry";
  if (t === "inventory") return "Inventory vs GL";
  if (t === "branch") return "Inter-branch balance";
  if (t === "system") return "Reconciliation engine";
  return "Issue";
}

function canRunReconciliation(user: StoredUser | null): boolean {
  if (!user) return false;
  if (user.userType === "system" || user.role === "super_admin") return true;
  const r = (user.role ?? "").toLowerCase().trim();
  return r === "admin" || r === "owner";
}

function severityBadgeClass(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical") return "text-destructive font-semibold";
  if (s === "warning") return "text-amber-600 dark:text-amber-500 font-medium";
  return "text-muted-foreground";
}

function rowSupportsTransferRepair(row: ReconciliationLogItem): boolean {
  const id = row.entityId?.trim();
  if (!id) return false;
  return row.type === "transfer" || row.type === "event";
}

function TransferRepairMenu({
  row,
  tenantSlug,
  busy,
  onBusy,
  onDone,
  onRepairError,
}: {
  row: ReconciliationLogItem;
  tenantSlug: string;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onDone: () => void;
  onRepairError: (message: string | null) => void;
}) {
  const transferId = row.entityId?.trim();
  if (!transferId) return <span className="text-muted-foreground">—</span>;

  const transferName = entityLabel(row);

  const run = async (
    label: string,
    fn: () => Promise<unknown>,
  ): Promise<void> => {
    if (
      !window.confirm(
        `${label} for “${transferName}”: this updates tenant data. Continue?`,
      )
    ) {
      return;
    }
    onBusy(transferId);
    onRepairError(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      onRepairError(e instanceof Error ? e.message : "Repair failed");
    } finally {
      onBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2"
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">Repair options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void run("Link orphan journals", () =>
              repairTransferJournalLinks(tenantSlug, transferId),
            );
          }}
        >
          Link journal IDs
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void run("Sync approval from replay", () =>
              repairTransferApprovalFromReplay(tenantSlug, transferId),
            );
          }}
        >
          Sync approval (replay)
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void run("Recreate missing journals", () =>
              recreateMissingTransferJournals(tenantSlug, transferId),
            );
          }}
        >
          Recreate missing journals
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function relatedLinkLabel(row: ReconciliationLogItem): string {
  const disp = row.entityDisplay?.trim();
  if (row.type === "transfer" || row.type === "event") {
    if (disp) {
      if (disp.includes("open in Related")) return "Open transfer";
      return disp.length > 40 ? `${disp.slice(0, 40)}…` : disp;
    }
    return "Open transfer";
  }
  if (row.type === "journal") {
    if (disp && disp.length > 0)
      return disp.length > 36 ? `${disp.slice(0, 36)}…` : disp;
    return "Open journal";
  }
  if (row.type === "inventory") {
    return disp && disp.length > 0
      ? disp.length > 36
        ? `${disp.slice(0, 36)}…`
        : disp
      : "Inventory";
  }
  if (row.type === "branch") {
    return disp && disp.length > 0
      ? disp.length > 36
        ? `${disp.slice(0, 36)}…`
        : disp
      : "Branches";
  }
  return "View";
}

function RelatedLink({ row }: { row: ReconciliationLogItem }) {
  const id = row.entityId?.trim();
  const linkText = relatedLinkLabel(row);
  if (row.type === "transfer" || row.type === "event") {
    if (!id) return <span className="text-muted-foreground">—</span>;
    return (
      <Link
        href={`/inventory/transfers/${id}`}
        title={entityLabel(row)}
        className="text-primary underline-offset-4 hover:underline"
      >
        {linkText}
      </Link>
    );
  }
  if (row.type === "journal") {
    if (!id) return <span className="text-muted-foreground">—</span>;
    return (
      <Link
        href={`/accounting/journals?highlight=${encodeURIComponent(id)}`}
        title={entityLabel(row)}
        className="text-primary underline-offset-4 hover:underline"
      >
        {linkText}
      </Link>
    );
  }
  if (row.type === "inventory") {
    const branchId =
      id ??
      (row.metadata &&
      typeof row.metadata === "object" &&
      row.metadata !== null &&
      "branch_id" in row.metadata
        ? String((row.metadata as { branch_id?: string }).branch_id ?? "")
        : "");
    if (branchId) {
      return (
        <Link
          href="/accounting/inventory-valuation"
          title={entityLabel(row)}
          className="text-primary underline-offset-4 hover:underline"
        >
          {linkText}
        </Link>
      );
    }
    return (
      <Link
        href="/accounting/inventory-valuation"
        title={entityLabel(row)}
        className="text-primary underline-offset-4 hover:underline"
      >
        {linkText}
      </Link>
    );
  }
  if (row.type === "branch") {
    return (
      <Link
        href="/inventory/branches"
        title={entityLabel(row)}
        className="text-primary underline-offset-4 hover:underline"
      >
        {linkText}
      </Link>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export default function ReconciliationPage() {
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [tenantSlug, setTenantSlug] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<StoredUser | null>(null);
  const [latestSummary, setLatestSummary] =
    React.useState<ReconciliationRunSummary | null>(null);
  const [lastFinishedAt, setLastFinishedAt] = React.useState<string | null>(
    null,
  );
  const [logs, setLogs] = React.useState<ReconciliationLogItem[]>([]);
  const [totalLogs, setTotalLogs] = React.useState(0);
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [repairBusyTransferId, setRepairBusyTransferId] = React.useState<
    string | null
  >(null);
  const [repairError, setRepairError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    setTenantSlug(u?.tenantSlug?.trim() || null);
  }, []);

  const load = React.useCallback(async () => {
    if (!tenantSlug) return;
    if (!branchId) {
      setLatestSummary(null);
      setLastFinishedAt(null);
      setLogs([]);
      setTotalLogs(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [latest, logRes] = await Promise.all([
        getLatestReconciliationRun(tenantSlug),
        getReconciliationLogs(tenantSlug, {
          severity: severityFilter === "all" ? undefined : severityFilter,
          type: typeFilter === "all" ? undefined : typeFilter,
          limit: 100,
          offset: 0,
        }),
      ]);
      const s = latest.run?.summary as ReconciliationRunSummary | null;
      setLatestSummary(s ?? null);
      setLastFinishedAt(
        latest.run?.finishedAt ?? latest.run?.startedAt ?? null,
      );
      setLogs(logRes.items);
      setTotalLogs(logRes.total);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load reconciliation",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId, severityFilter, typeFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onRun = async () => {
    if (!tenantSlug || !branchId) return;
    setRunning(true);
    setError(null);
    try {
      await runFullReconciliation(tenantSlug);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const summary = latestSummary ?? {};
  const totalIssues = Number(summary.totalIssues ?? 0);
  const unitsExamined = Number(
    summary.total_checks ?? summary.totalChecks ?? 0,
  );
  const critical = Number(summary.critical ?? 0);
  const warnings = Number(summary.warning ?? 0);
  const infoCount = Number(summary.info ?? 0);
  const lastRunDuration = formatDurationMs(
    summary.duration_ms ?? summary.durationMs,
  );
  const branchScopeLabel = formatBranchScope(summary.branchScope);
  const showRun = canRunReconciliation(user);

  if (!tenantSlug) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Sign in and select a tenant to access reconciliation.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Financial control checks: transfers, journals, cross-branch
            balances, inventory vs GL, and event consistency. Issues are logged
            for review; optional admin repair actions are available per row
            below.
          </p>
          {showRun ? (
            <p className="text-sm text-muted-foreground">
              <Link
                href="/docs/operator-reconciliation-runbook.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                Operator runbook (investigation and repair API)
              </Link>
            </p>
          ) : null}
        </div>
        {showRun ? (
          <Button
            onClick={() => void onRun()}
            disabled={running || !branchId}
            className="shrink-0"
          >
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run reconciliation
          </Button>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {!branchId ? (
        <Card className="border-amber-300/70">
          <CardContent className="p-4 text-sm text-muted-foreground">
            {aggregateAll
              ? "Select a specific branch in the team switcher to view reconciliation data. All-branch scope is disabled on this page."
              : "Select a branch in the team switcher to view reconciliation data."}
          </CardContent>
        </Card>
      ) : null}

      {repairError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col gap-2 p-4 text-sm text-destructive">
            <span>{repairError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start border-destructive/40"
              onClick={() => setRepairError(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total issues (last run)
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : totalIssues}
            </div>
            <p className="text-xs text-muted-foreground">
              From latest completed run summary
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checks done</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : unitsExamined}
            </div>
            <p className="text-xs text-muted-foreground">
              Rows / branches / journals examined
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {loading ? "—" : critical}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings / info</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : `${warnings} / ${infoCount}`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last run</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {loading ? "—" : formatDateTime(lastFinishedAt)}
            </div>
            {!loading && lastRunDuration ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Duration {lastRunDuration}
              </p>
            ) : null}
            {!loading ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Scope: {branchScopeLabel}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issue log</CardTitle>
          <CardDescription>
            Filter by severity and type. Data reflects the current filters and
            latest fetch.
          </CardDescription>
          <div className="flex flex-wrap gap-3 pt-2">
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="journal">Journal</SelectItem>
                <SelectItem value="branch">Branch</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!branchId}
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Entity / name</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-[100px]">Related</TableHead>
                  {showRun ? (
                    <TableHead className="w-[120px]">Repair</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showRun ? 7 : 6}
                      className="text-center text-muted-foreground"
                    >
                      No issues match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.type}
                      </TableCell>
                      <TableCell className="max-w-[min(28rem,55vw)]">
                        <div className="text-sm font-medium text-foreground">
                          {entityLabel(row)}
                        </div>
                      </TableCell>
                      <TableCell className={severityBadgeClass(row.severity)}>
                        {row.severity}
                      </TableCell>
                      <TableCell className="max-w-xl text-sm">
                        {row.message}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <RelatedLink row={row} />
                      </TableCell>
                      {showRun ? (
                        <TableCell>
                          {rowSupportsTransferRepair(row) ? (
                            <TransferRepairMenu
                              row={row}
                              tenantSlug={tenantSlug}
                              busy={repairBusyTransferId === row.entityId?.trim()}
                              onBusy={setRepairBusyTransferId}
                              onDone={load}
                              onRepairError={(msg) => setRepairError(msg)}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {!loading && totalLogs > logs.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {logs.length} of {totalLogs} matching rows (limit 100).
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
