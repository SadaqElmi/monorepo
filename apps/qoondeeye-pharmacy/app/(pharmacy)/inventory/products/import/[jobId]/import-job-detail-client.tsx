"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { getStoredUser } from "@/lib/auth-client";
import { invalidateErpCatalogQueries } from "@/lib/invalidate-erp-catalog";
import {
  downloadImportErrorsExport,
  getImportJobDetail,
  reverseImportJob,
  type ImportJobRow,
} from "@/lib/services/imports";
import {
  cellValue,
  PRODUCT_IMPORT_DETAIL_COLUMNS,
} from "@/components/features/import/import-preview-utils";

type ImportJobActor = {
  id: string;
  name: string | null;
  email: string | null;
};

type ImportAuditEvent = {
  id: string;
  eventAt: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: ImportJobActor | null;
  branchId: string | null;
  details: Record<string, unknown> | null;
  rowNumber: number | null;
  itemNo: string | null;
  productName: string | null;
};

type ImportJobDetail = Awaited<ReturnType<typeof getImportJobDetail>>;
import { useQueryClient } from "@tanstack/react-query";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "secondary",
    validating: "secondary",
    preview: "default",
    confirmed: "default",
    committing: "secondary",
    completed: "default",
    failed: "destructive",
    reversed: "secondary",
  };
  return map[status] ?? "secondary";
}

function rowIssues(row: ImportJobRow): string {
  const parts = [
    ...(row.validationResult?.errors ?? []).map((e) => e.message),
    ...(row.validationResult?.warnings ?? []).map((w) => w.message),
    ...(row.commitError ? [row.commitError] : []),
  ];
  return parts.join("; ") || "—";
}

function formatActor(user: ImportJobActor | null): string {
  if (!user) return "—";
  return user.name?.trim() || user.email?.trim() || user.id.slice(0, 8);
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  confirmed: "Import confirmed",
  completed: "Import completed",
  import_create: "Product created",
  import_update: "Product updated",
  import_reverse: "Opening stock reversed",
};

function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function auditItemLabel(event: ImportAuditEvent): string {
  if (event.itemNo && event.productName) {
    return `${event.itemNo} — ${event.productName}`;
  }
  if (event.itemNo) return event.itemNo;
  if (event.productName) return event.productName;
  if (event.details?.itemNo && event.details?.name) {
    return `${String(event.details.itemNo)} — ${String(event.details.name)}`;
  }
  if (event.details?.quantity != null) {
    return `Qty ${String(event.details.quantity)}`;
  }
  return "—";
}

export function ImportJobDetailClient({
  jobId,
  backHref = "/inventory/products/import/history",
  importBackHref = "/inventory/products/import",
  title = "Import job detail",
  showReverse = true,
}: {
  jobId: string;
  backHref?: string;
  importBackHref?: string;
  title?: string;
  showReverse?: boolean;
}) {
  const tenantSlug = useMemo(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
    [],
  );
  const queryClient = useQueryClient();

  const [detail, setDetail] = useState<ImportJobDetail | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "errors" | "committed">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getImportJobDetail(tenantSlug, jobId, page, 50, filter);
      setDetail(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load import job");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, jobId, page, filter]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleDownloadErrors = async () => {
    setBusy(true);
    try {
      const blob = await downloadImportErrorsExport(tenantSlug, jobId);
      downloadBlob(blob, `import-errors-${jobId}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReverse = async () => {
    setBusy(true);
    setError(null);
    try {
      await reverseImportJob(tenantSlug, jobId);
      await invalidateErpCatalogQueries(queryClient);
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reverse failed");
    } finally {
      setBusy(false);
    }
  };

  const job = detail?.job;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {job?.fileName ?? jobId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={backHref}>Import history</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={importBackHref}>
              <ArrowLeft className="mr-2 size-4" />
              Back to import
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !detail ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : detail && job ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Status">
              <Badge variant={statusBadge(job.status) as "default"}>
                {job.status}
              </Badge>
            </SummaryTile>
            <SummaryTile label="Total rows" value={job.totalRows} />
            <SummaryTile label="Committed" value={detail.rowCounts.committed} />
            <SummaryTile
              label="Failed"
              value={detail.rowCounts.failed}
              danger
            />
            <SummaryTile label="Reversed" value={detail.rowCounts.reversed} />
            <SummaryTile label="Skipped" value={detail.rowCounts.skipped} />
            <SummaryTile label="Pending" value={detail.rowCounts.pending} />
            {job.summary && (
              <SummaryTile
                label="Validation errors"
                value={job.summary.errorRows}
                danger
              />
            )}
          </div>

          {job.errorMessage && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-destructive">
                  Job error
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{job.errorMessage}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Who &amp; when</CardTitle>
              <CardDescription>
                Upload, confirmation, commit, and reversal audit metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Uploaded by</dt>
                  <dd className="font-medium">{formatActor(detail.createdByUser)}</dd>
                  <dd className="text-muted-foreground text-xs">
                    {formatWhen(job.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Confirmed by</dt>
                  <dd className="font-medium">{formatActor(detail.confirmedByUser)}</dd>
                  <dd className="text-muted-foreground text-xs">
                    {formatWhen(job.confirmedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Committed at</dt>
                  <dd className="font-medium">{formatWhen(job.committedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Reversed</dt>
                  <dd className="font-medium">
                    {job.reversedAt
                      ? formatActor(detail.reversedByUser)
                      : "—"}
                  </dd>
                  <dd className="text-muted-foreground text-xs">
                    {formatWhen(job.reversedAt)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions</CardTitle>
              <CardDescription>
                Download a fix-and-reupload file or reverse opening stock only.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {detail.canDownloadErrors && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleDownloadErrors()}
                >
                  <Download className="mr-2 size-4" />
                  Download error report
                </Button>
              )}
              {showReverse && detail.canReverse ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={busy}>
                      <RotateCcw className="mr-2 size-4" />
                      Reverse import
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reverse this import?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes opening stock, batches, and GL entries
                        created by this import. Product master data (names,
                        barcodes, categories) will not be changed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleReverse()}>
                        Reverse opening stock
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : job.status === "completed" ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button variant="outline" disabled>
                          <RotateCcw className="mr-2 size-4" />
                          Reverse import
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {detail.reverseBlockReason ??
                        "Reversal is not available"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Imported rows</CardTitle>
                <CardDescription>
                  Page {detail.page} of {detail.totalPages}
                </CardDescription>
              </div>
              <Select
                value={filter}
                onValueChange={(v) => {
                  setFilter(v as typeof filter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rows</SelectItem>
                  <SelectItem value="errors">Errors / warnings</SelectItem>
                  <SelectItem value="committed">Committed</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="max-h-[32rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      {detail.job.importType === "product" ? (
                        PRODUCT_IMPORT_DETAIL_COLUMNS.map((column) => (
                          <TableHead key={column.field}>{column.label}</TableHead>
                        ))
                      ) : (
                        <>
                          <TableHead>Item no</TableHead>
                          <TableHead>Name</TableHead>
                        </>
                      )}
                      <TableHead>Action</TableHead>
                      {detail.job.importType !== "product" ? (
                        <>
                          <TableHead>Branch</TableHead>
                          <TableHead>Opening qty</TableHead>
                        </>
                      ) : null}
                      <TableHead>Product ID</TableHead>
                      {detail.job.importType !== "product" ? (
                        <TableHead>Batch ID</TableHead>
                      ) : null}
                      <TableHead>Status</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.rowNumber}</TableCell>
                        {detail.job.importType === "product" ? (
                          PRODUCT_IMPORT_DETAIL_COLUMNS.map((column) => (
                            <TableCell key={column.field}>
                              {cellValue(r, column.field) || "—"}
                            </TableCell>
                          ))
                        ) : (
                          <>
                            <TableCell>
                              {String(
                                r.parsedData?.itemNo ?? r.rawData.item_no ?? "",
                              )}
                            </TableCell>
                            <TableCell>
                              {String(
                                r.parsedData?.name ?? r.rawData.name ?? "",
                              )}
                            </TableCell>
                          </>
                        )}
                        <TableCell>{r.validationResult?.action ?? "—"}</TableCell>
                        {detail.job.importType !== "product" ? (
                          <>
                            <TableCell>
                              {String(
                                r.parsedData?.branchCode ??
                                  r.rawData.branch_code ??
                                  "",
                              )}
                            </TableCell>
                            <TableCell>
                              {String(
                                r.parsedData?.openingQty ??
                                  r.rawData.opening_qty ??
                                  "",
                              )}
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell className="font-mono text-xs">
                          {r.resolvedProductId
                            ? `${r.resolvedProductId.slice(0, 8)}…`
                            : "—"}
                        </TableCell>
                        {detail.job.importType !== "product" ? (
                          <TableCell className="font-mono text-xs">
                            {r.resolvedBatchId
                              ? `${r.resolvedBatchId.slice(0, 8)}…`
                              : "—"}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <Badge variant="secondary">{r.commitStatus}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          {rowIssues(r)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex gap-2">
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
                  disabled={page >= detail.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>

          {detail.auditEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audit trail</CardTitle>
                <CardDescription>
                  Tamper-evident log entries for this import ({detail.auditEvents.length}{" "}
                  events)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Row</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.auditEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {formatWhen(event.eventAt)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatAuditAction(event.action)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm">
                            {auditItemLabel(event)}
                          </TableCell>
                          <TableCell>{event.rowNumber ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {formatActor(event.actor)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  danger,
  children,
}: {
  label: string;
  value?: number;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children ?? (
        <p
          className={`text-xl font-semibold ${danger && (value ?? 0) > 0 ? "text-destructive" : ""}`}
        >
          {value ?? 0}
        </p>
      )}
    </div>
  );
}
