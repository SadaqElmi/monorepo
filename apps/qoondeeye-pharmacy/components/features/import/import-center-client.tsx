"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  RotateCcw,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";

import { ImportCenterRunningPanel } from "@/components/features/import/import-center-running-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  formatImportDuration,
  importCenterQueryString,
  importJobDetailPath,
  importRowStats,
  IMPORT_STATUS_LABEL,
  legacyImportTypeLabel,
  permissionForImportType,
} from "@/lib/import-center";
import type { ImportCenterPageData } from "@/lib/import-center";
import { getResolvedStoredUser } from "@/lib/auth-client";
import {
  downloadImportErrorsExport,
  retryImportJob,
  type ImportJobListItem,
  type ImportType,
} from "@/lib/services/imports";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(
  user: { name: string | null; email: string | null } | null | undefined,
): string {
  if (!user) return "—";
  return user.name?.trim() || user.email?.trim() || "—";
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "completed") return "default";
  if (status === "reversed") return "outline";
  if (status === "committing" || status === "validating") return "secondary";
  return "secondary";
}

function SummaryCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">
          {value.toLocaleString()}
        </p>
        {sub ? (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FailedJobActions({
  job,
  tenantSlug,
  permissions,
}: {
  job: ImportJobListItem;
  tenantSlug: string;
  permissions: string[];
}) {
  const [busy, setBusy] = useState(false);
  const perm = permissionForImportType(job.importType);
  const canAct = permissions.includes(perm);

  const onErrors = async () => {
    setBusy(true);
    try {
      const blob = await downloadImportErrorsExport(tenantSlug, job.id);
      downloadBlob(blob, `import-errors-${job.id.slice(0, 8)}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const onRetry = async () => {
    if (job.status !== "failed") {
      toast.error("Only failed imports can be retried from here.");
      return;
    }
    if (!canAct) {
      toast.error("You do not have permission to retry this import.");
      return;
    }
    setBusy(true);
    try {
      await retryImportJob(tenantSlug, job.id);
      toast.success("Retry started");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };

  const detailPath = importJobDetailPath(job.importType, job.id);

  return (
    <div className="flex flex-wrap gap-2">
      {detailPath ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={detailPath}>View errors</Link>
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void onErrors()}
      >
        {busy ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Download className="mr-1 h-3 w-3" />
        )}
        Excel
      </Button>
      {canAct ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void onRetry()}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export default function ImportCenterClient({
  initial,
  serverPrefetched,
  permissions,
  tenantSlug: tenantSlugProp,
}: {
  initial: ImportCenterPageData | null;
  serverPrefetched: boolean;
  permissions: string[];
  tenantSlug: string;
}) {
  const router = useRouter();
  const tenantSlug =
    tenantSlugProp.trim() ||
    getResolvedStoredUser()?.tenantSlug?.trim() ||
    "";

  const dashboard = initial?.dashboard;
  const jobs = initial?.jobs.jobs ?? [];
  const jobsTotal = initial?.jobs.total ?? 0;
  const failedJobs = initial?.failed.jobs ?? [];
  const pageNum = initial?.pageNum ?? 1;
  const pageSize = initial?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(jobsTotal / pageSize));

  const filterDefaults = useMemo(
    () => ({
      importType: initial?.filters.importType ?? "",
      status: initial?.filters.status ?? "",
      from: initial?.filters.from?.slice(0, 10) ?? "",
      to: initial?.filters.to?.slice(0, 10) ?? "",
      createdBy: initial?.filters.createdBy ?? "",
    }),
    [initial?.filters],
  );

  const [importType, setImportType] = useState(filterDefaults.importType);
  const [status, setStatus] = useState(filterDefaults.status);
  const [from, setFrom] = useState(filterDefaults.from);
  const [to, setTo] = useState(filterDefaults.to);
  const [createdBy, setCreatedBy] = useState(filterDefaults.createdBy);

  const applyFilters = useCallback(
    (page = 1) => {
      const qs = importCenterQueryString({
        importType: importType || undefined,
        status: status || undefined,
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        createdBy: createdBy || undefined,
        pageNum: page > 1 ? page : undefined,
      });
      router.push(`/administration/import-center${qs}`);
    },
    [importType, status, from, to, createdBy, router],
  );

  const onFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    applyFilters(1);
  };

  const canImport = (type: ImportType) =>
    permissions.includes(permissionForImportType(type));

  if (!serverPrefetched && !initial) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">Import Center</h1>
        <p className="text-sm text-muted-foreground">
          Unable to load import data. Check your connection and refresh, or confirm
          you have Import Center access.
        </p>
        <Button variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">Import Center</h1>
        <p className="text-sm text-muted-foreground">
          Monitor and manage product and opening stock imports across your
          pharmacy.
        </p>
      </div>

      {dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard title="Total imports" value={dashboard.total} />
            <SummaryCard title="Running" value={dashboard.running} />
            <SummaryCard title="Completed" value={dashboard.completed} />
            <SummaryCard title="Failed" value={dashboard.failed} />
            <SummaryCard
              title="Rolled back"
              value={dashboard.rolledBack}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Product imports"
              value={dashboard.byType.product}
            />
            <SummaryCard
              title="Opening stock imports"
              value={dashboard.byType.opening_stock}
            />
          </div>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Link
          href="/inventory/products/import"
          className={canImport("product") ? "" : "pointer-events-none opacity-50"}
        >
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Package className="h-5 w-5" />
              <CardTitle className="text-base">Product import</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Catalog-only Excel import
            </CardContent>
          </Card>
        </Link>
        <Link
          href="/inventory/opening-stock/import"
          className={
            canImport("opening_stock") ? "" : "pointer-events-none opacity-50"
          }
        >
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Warehouse className="h-5 w-5" />
              <CardTitle className="text-base">Opening stock</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Migration opening balances
            </CardContent>
          </Card>
        </Link>
      </div>

      <ImportCenterRunningPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Failed imports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {failedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No failed imports.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Import</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <p className="font-medium">
                        {job.fileName ?? legacyImportTypeLabel(job.importType)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {legacyImportTypeLabel(job.importType)}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {job.errorMessage ?? "Import failed"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatShortDate(job.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {actorLabel(job.createdByUser)}
                    </TableCell>
                    <TableCell>
                      <FailedJobActions
                        job={job}
                        tenantSlug={tenantSlug}
                        permissions={permissions}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onFilterSubmit}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div className="space-y-2">
              <Label>Import type</Label>
              <Select
                value={importType || "all"}
                onValueChange={(v) =>
                  setImportType(v === "all" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="opening_stock">Opening stock</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status || "all"}
                onValueChange={(v) => setStatus(v === "all" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(IMPORT_STATUS_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Created by (user ID)</Label>
              <Input
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="UUID"
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <Button type="submit">Apply filters</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setImportType("");
                  setStatus("");
                  setFrom("");
                  setTo("");
                  setCreatedBy("");
                  router.push("/administration/import-center");
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Import jobs</CardTitle>
          <span className="text-sm text-muted-foreground">
            {jobsTotal.toLocaleString()} total
          </span>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>OK</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Warn</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">
                    No jobs match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => {
                  const stats = importRowStats(job.summary);
                  const showRollback =
                    job.status === "completed" &&
                    job.importType === "opening_stock";
                  const detailPath = importJobDetailPath(
                    job.importType,
                    job.id,
                  );
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">
                        {job.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        {legacyImportTypeLabel(job.importType)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(job.status)}>
                          {IMPORT_STATUS_LABEL[job.status] ?? job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {actorLabel(job.createdByUser)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatShortDate(job.createdAt)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {job.totalRows}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {stats.success}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {stats.failed}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {stats.warnings}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatImportDuration(job.durationSeconds)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {detailPath ? (
                            <Link
                              href={detailPath}
                              className="text-sm text-primary hover:underline"
                            >
                              Open details
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Read-only (legacy)
                            </span>
                          )}
                          {showRollback && detailPath ? (
                            <Link
                              href={detailPath}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Rollback available
                            </Link>
                          ) : null}
                          <div className="text-xs text-muted-foreground">
                            {job.confirmedByUser ? (
                              <span>
                                Confirmed: {actorLabel(job.confirmedByUser)}
                              </span>
                            ) : null}
                            {job.reversedByUser ? (
                              <span className="block">
                                Reversed: {actorLabel(job.reversedByUser)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNum <= 1}
                onClick={() => applyFilters(pageNum - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pageNum} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageNum >= totalPages}
                onClick={() => applyFilters(pageNum + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileSpreadsheet className="h-3 w-3" />
        Row-level audit and rollback run on each job&apos;s detail page.
      </p>
    </div>
  );
}
