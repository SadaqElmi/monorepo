"use client";

/** @deprecated Use ErpImportWizard from @/components/features/import/erp-import-wizard instead. */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Layers,
  Loader2,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getStoredUser } from "@/lib/auth-client";
import {
  confirmAndCommitImportJob,
  downloadImportErrorsExport,
  downloadProductImportTemplate,
  getImportPreview,
  listImportJobs,
  uploadProductImportJob,
  updateImportPreviewRows,
  validateImportJob,
  type ImportJob,
  type ImportJobRow,
  type ImportJobSummary,
} from "@/lib/services/product-import";
import { invalidateErpCatalogQueries } from "@/lib/invalidate-erp-catalog";
import { useQueryClient } from "@tanstack/react-query";

type WizardStep =
  | "template"
  | "upload"
  | "validate"
  | "preview"
  | "confirm"
  | "commit"
  | "done";

type ImportPreviewField =
  | "item_no"
  | "barcode"
  | "name"
  | "generic_name"
  | "strength"
  | "formulation"
  | "category_path"
  | "unit"
  | "list_price"
  | "branch_code"
  | "opening_qty"
  | "cost_price"
  | "batch_number"
  | "expiry_date"
  | "reorder_level"
  | "supplier_name"
  | "opening_date";

type EditingCell = {
  rowId: string;
  field: ImportPreviewField;
} | null;

type ImportPreviewColumn = {
  field: ImportPreviewField;
  label: string;
  align?: "left" | "center" | "right";
  className?: string;
  headClassName?: string;
};

const PREVIEW_COLUMNS: ImportPreviewColumn[] = [
  {
    field: "item_no",
    label: "Item No",
    className: "font-medium text-slate-900",
    headClassName: "w-[110px]",
  },
  {
    field: "barcode",
    label: "Barcode",
    className: "font-mono text-xs text-slate-600",
  },
  {
    field: "name",
    label: "Item Name",
    className: "font-semibold text-slate-800",
  },
  {
    field: "generic_name",
    label: "Generic Name",
    className: "text-xs italic text-slate-600",
  },
  {
    field: "strength",
    label: "Strength",
    className: "text-xs text-slate-600",
  },
  {
    field: "formulation",
    label: "Form",
    className: "text-xs text-slate-600",
  },
  {
    field: "category_path",
    label: "Category Path",
    className: "max-w-[180px] truncate text-xs text-slate-500",
  },
  {
    field: "unit",
    label: "Unit",
    align: "center",
  },
  {
    field: "list_price",
    label: "List Price",
    align: "right",
    className: "font-bold text-emerald-700",
  },
  {
    field: "branch_code",
    label: "Branch",
    align: "center",
    className: "font-mono text-xs text-slate-600",
  },
  {
    field: "opening_qty",
    label: "Qty",
    align: "center",
    className: "font-medium text-slate-700",
  },
  {
    field: "cost_price",
    label: "Cost Price",
    align: "right",
    className: "font-medium",
  },
  {
    field: "batch_number",
    label: "Batch No",
    className: "font-mono text-xs text-slate-600",
  },
  {
    field: "expiry_date",
    label: "Expiry Date",
    align: "right",
    className: "text-xs text-slate-600",
  },
  {
    field: "reorder_level",
    label: "Reorder",
    align: "center",
  },
  {
    field: "supplier_name",
    label: "Supplier",
    className: "text-xs text-slate-600",
  },
  {
    field: "opening_date",
    label: "Opening Date",
    align: "right",
    className: "text-xs text-slate-600",
  },
];

const PARSED_FIELD_BY_RAW: Partial<Record<ImportPreviewField, string>> = {
  item_no: "itemNo",
  barcode: "barcode",
  name: "name",
  generic_name: "genericName",
  strength: "strength",
  formulation: "formulation",
  category_path: "categoryPath",
  unit: "unit",
  list_price: "listPrice",
  branch_code: "branchCode",
  opening_qty: "openingQty",
  cost_price: "costPrice",
  batch_number: "batchNumber",
  expiry_date: "expiryDate",
  reorder_level: "reorderLevel",
  supplier_name: "supplierName",
  opening_date: "openingDate",
};

const DATE_FIELDS = new Set<ImportPreviewField>([
  "expiry_date",
  "opening_date",
]);

const MONEY_FIELDS = new Set<ImportPreviewField>(["list_price", "cost_price"]);

const NUMBER_FIELDS = new Set<ImportPreviewField>([
  "list_price",
  "opening_qty",
  "cost_price",
  "reorder_level",
]);

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

function cellValue(row: ImportJobRow, field: ImportPreviewField): string {
  const rawValue = row.rawData[field];
  if (rawValue != null && rawValue !== "") return String(rawValue);
  const parsedField = PARSED_FIELD_BY_RAW[field];
  const parsedValue = parsedField ? row.parsedData?.[parsedField] : null;
  if (parsedValue == null || parsedValue === "") return "";
  return String(parsedValue);
}

function normalizeEditValue(field: ImportPreviewField, value: string): string {
  const trimmed = value.trim();
  if (DATE_FIELDS.has(field) && !trimmed) return "";
  if (NUMBER_FIELDS.has(field) && !trimmed) return "";
  return trimmed;
}

function formatCellValue(field: ImportPreviewField, value: string): string {
  if (!value) return "-";
  if (MONEY_FIELDS.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : value;
  }
  if (field === "opening_qty" || field === "reorder_level") {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : value;
  }
  return value;
}

function rawRowsSignature(rows: ImportJobRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      rawData: row.rawData,
    })),
  );
}

function alignClass(align: ImportPreviewColumn["align"]): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

export default function ImportClient() {
  const tenantSlug = useMemo(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
    [],
  );
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("template");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [summary, setSummary] = useState<ImportJobSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportJobRow[]>([]);
  const [originalPreviewRows, setOriginalPreviewRows] = useState<
    ImportJobRow[]
  >([]);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const skipBlurSaveRef = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await listImportJobs(tenantSlug);
      setHistory(res.jobs);
    } catch {
      /* optional */
    }
  }, [tenantSlug]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const applyPendingEdit = useCallback(
    (rows: ImportJobRow[]) => {
      if (!editingCell) return rows;
      return rows.map((row) => {
        if (row.id !== editingCell.rowId) return row;
        return {
          ...row,
          rawData: {
            ...row.rawData,
            [editingCell.field]: normalizeEditValue(
              editingCell.field,
              editValue,
            ),
          },
        };
      });
    },
    [editingCell, editValue],
  );

  const handleCellClick = useCallback(
    (row: ImportJobRow, field: ImportPreviewField) => {
      setEditingCell({ rowId: row.id, field });
      setEditValue(cellValue(row, field));
    },
    [],
  );

  const handleCellChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);

  const handleSaveCell = useCallback(() => {
    if (skipBlurSaveRef.current) {
      skipBlurSaveRef.current = false;
      return;
    }
    if (!editingCell) return;
    setPreviewRows((rows) => applyPendingEdit(rows));
    setEditingCell(null);
    setEditValue("");
  }, [applyPendingEdit, editingCell]);

  const handleCancelCell = useCallback(() => {
    skipBlurSaveRef.current = true;
    setEditingCell(null);
    setEditValue("");
  }, []);

  const handleResetPreviewRows = useCallback(() => {
    setPreviewRows(originalPreviewRows);
    setEditingCell(null);
    setEditValue("");
    setError(null);
  }, [originalPreviewRows]);

  const previewRowsForSubmit = useMemo(
    () => applyPendingEdit(previewRows),
    [applyPendingEdit, previewRows],
  );

  const hasPreviewEdits = useMemo(
    () =>
      rawRowsSignature(previewRowsForSubmit) !==
      rawRowsSignature(originalPreviewRows),
    [originalPreviewRows, previewRowsForSubmit],
  );

  const startImportCommit = async (jobId: string) => {
    setStep("commit");
    const res = await confirmAndCommitImportJob(tenantSlug, jobId);
    setJob(res.job);
    if (res.progress) {
      setProgress({
        processed: res.progress.processed,
        total: res.progress.total,
      });
    }
    if (res.job.status === "completed") {
      setStep("done");
      await invalidateErpCatalogQueries(queryClient);
      await loadHistory();
      setBusy(false);
      return;
    }
    if (res.job.status === "failed") {
      setError(res.job.errorMessage ?? res.progress?.message ?? "Import failed");
      setBusy(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadProductImportTemplate(tenantSlug);
      downloadBlob(blob, "product-import-template.xlsx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    setSummary(null);
    setPreviewRows([]);
    setOriginalPreviewRows([]);
    setEditingCell(null);
    try {
      const res = await uploadProductImportJob(tenantSlug, file);
      setJob(res.job);
      setStep("validate");
      setBusy(false);
      await handleValidate(res.job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  };

  const handleValidate = async (jobId: string) => {
    setBusy(true);
    setError(null);
    setStep("validate");
    try {
      const res = await validateImportJob(tenantSlug, jobId);
      setJob(res.job);
      setSummary(res.job.summary);
      const preview = await getImportPreview(tenantSlug, jobId, 1, 100);
      setSummary(preview.summary);
      setPreviewRows(preview.rows);
      setOriginalPreviewRows(preview.rows);
      setEditingCell(null);
      setEditValue("");
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndImport = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);

    const rowsToSubmit = previewRowsForSubmit;
    setPreviewRows(rowsToSubmit);
    setEditingCell(null);
    setEditValue("");

    try {
      const editsToSave =
        rawRowsSignature(rowsToSubmit) !==
        rawRowsSignature(originalPreviewRows);
      let currentJob = job;
      let currentSummary = summary ?? job.summary;

      if (editsToSave) {
        const preview = await updateImportPreviewRows(
          tenantSlug,
          job.id,
          rowsToSubmit.map((row) => ({
            id: row.id,
            rawData: row.rawData,
          })),
        );
        currentJob = preview.job;
        currentSummary = preview.summary;
        setJob(preview.job);
        setSummary(preview.summary);
        setPreviewRows(preview.rows);
        setOriginalPreviewRows(preview.rows);
      }

      if ((currentSummary?.errorRows ?? 0) > 0) {
        setStep("preview");
        setError("Fix the highlighted validation errors before importing.");
        setBusy(false);
        return;
      }

      if (currentJob.status !== "preview") {
        setStep("preview");
        setError(
          `Import is not ready to commit (status: ${currentJob.status}).`,
        );
        setBusy(false);
        return;
      }

      await startImportCommit(currentJob.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save and import failed");
      setBusy(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (!job) return;
    try {
      const blob = await downloadImportErrorsExport(tenantSlug, job.id);
      downloadBlob(blob, `import-errors-${job.id}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const errorCount = summary?.errorRows ?? job?.summary?.errorRows ?? 0;
  const warningCount = summary?.warningRows ?? job?.summary?.warningRows ?? 0;
  const showErrorDownload =
    Boolean(job) &&
    (job!.status === "failed" ||
      errorCount > 0 ||
      warningCount > 0 ||
      step === "preview");
  const canEditPreview = job?.status === "preview" || job?.status === "failed";
  const canSaveAndImport =
    Boolean(job) &&
    canEditPreview &&
    !busy &&
    (hasPreviewEdits || errorCount === 0);
  const importDate = job?.createdAt
    ? new Date(job.createdAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 bg-slate-50/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Import products
          </h1>
          <p className="text-muted-foreground text-sm">
            Upload Excel to create or update products and opening stock.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/products">Back to products</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventory/products/import/history">
              <History className="mr-2 size-4" />
              View import history
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-5" />
            Import wizard
          </CardTitle>
          <CardDescription>
            Step: {step}
            {job && (
              <>
                {" "}
                · Job{" "}
                <Badge variant={statusBadge(job.status) as "default"}>
                  {job.status}
                </Badge>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(step === "template" || step === "upload") && (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleDownloadTemplate()}
              >
                <Download className="mr-2 size-4" />
                Download template
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 size-4" />
                Upload Excel
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
            </div>
          )}

          {(step === "validate" || step === "commit") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {step === "validate" ? "Validating rows…" : "Committing import…"}
              {progress && (
                <span>
                  {progress.processed} / {progress.total}
                </span>
              )}
            </div>
          )}

          {step === "preview" && summary && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-row items-center justify-between gap-4 p-6 pb-4">
                  <div className="space-y-1">
                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800">
                      <FileSpreadsheet className="size-5 text-emerald-600" />
                      Excel Data Import Review
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Review spreadsheet details and validation results before
                      committing.
                    </p>
                  </div>
                  <Badge
                    variant={errorCount > 0 ? "destructive" : "secondary"}
                    className={
                      errorCount > 0
                        ? "px-3 py-1 text-xs font-semibold"
                        : "border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    }
                  >
                    {errorCount > 0
                      ? `${errorCount} Errors`
                      : "Pending Approval"}
                  </Badge>
                </div>

                <div className="space-y-4 px-6 pb-6">
                  <div className="grid grid-cols-1 gap-6 rounded-lg border border-slate-200/60 bg-slate-100/60 p-4 md:grid-cols-4">
                    <PreviewInfo
                      label="File Name"
                      value={job?.fileName ?? "Import file"}
                    />
                    <PreviewInfo
                      label="Target Branch"
                      value="From branch_code column"
                    />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Total Records Detected
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        <Layers className="size-4 text-slate-500" />
                        {summary.totalRows} Items
                      </p>
                    </div>
                    <PreviewInfo label="Import Date" value={importDate} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <SummaryTile
                      label="Creates"
                      value={summary.createProducts ?? 0}
                    />
                    <SummaryTile
                      label="Updates"
                      value={summary.updateProducts ?? 0}
                    />
                    <SummaryTile
                      label="Opening stock"
                      value={summary.openingStockRows ?? 0}
                    />
                    <SummaryTile label="Skipped" value={summary.skipRows} />
                    <SummaryTile
                      label="Errors"
                      value={summary.errorRows}
                      danger
                    />
                    <SummaryTile label="Warnings" value={summary.warningRows} />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      Data Grid Preview
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Showing v1 product import columns from your file.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                    <AlertCircle className="size-4" />
                    Edited rows are validated again before import.
                  </div>
                </div>

                <div className="max-h-[520px] overflow-auto border-y border-slate-200">
                  <Table className="min-w-[2150px]">
                    <TableHeader className="sticky top-0 z-10 bg-slate-50">
                      <TableRow>
                        <TableHead className="w-[70px] font-semibold text-slate-700">
                          Row
                        </TableHead>
                        {PREVIEW_COLUMNS.map((column) => (
                          <TableHead
                            key={column.field}
                            className={`font-semibold text-slate-700 ${alignClass(
                              column.align,
                            )} ${column.headClassName ?? ""}`}
                          >
                            {column.label}
                          </TableHead>
                        ))}
                        <TableHead className="min-w-[260px] font-semibold text-slate-700">
                          Issues
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => {
                        const hasErrors =
                          (row.validationResult?.errors.length ?? 0) > 0;
                        const hasWarnings =
                          (row.validationResult?.warnings.length ?? 0) > 0;
                        return (
                          <TableRow
                            key={row.id}
                            className={`transition-colors ${
                              hasErrors
                                ? "bg-red-50/60 hover:bg-red-50"
                                : hasWarnings
                                  ? "bg-amber-50/50 hover:bg-amber-50"
                                  : "hover:bg-slate-50/70"
                            }`}
                          >
                            <TableCell className="font-medium text-slate-500">
                              {row.rowNumber}
                            </TableCell>
                            {PREVIEW_COLUMNS.map((column) => (
                              <EditablePreviewCell
                                key={`${row.id}-${column.field}`}
                                row={row}
                                column={column}
                                editingCell={editingCell}
                                editValue={editValue}
                                onStartEdit={handleCellClick}
                                onChange={handleCellChange}
                                onSave={handleSaveCell}
                                onCancel={handleCancelCell}
                              />
                            ))}
                            <TableCell className="max-w-[320px] whitespace-normal text-xs">
                              <RowIssueSummary row={row} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {showErrorDownload && (
                      <Button
                        variant="outline"
                        onClick={() => void handleDownloadErrors()}
                      >
                        Download error report
                      </Button>
                    )}
                    {hasPreviewEdits && (
                      <Badge
                        variant="outline"
                        className="border-blue-200 text-blue-700"
                      >
                        Unsaved edits
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!hasPreviewEdits || busy}
                      onClick={handleResetPreviewRows}
                      className="gap-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <RotateCcw className="size-4" />
                      Reset Changes
                    </Button>
                    <Button
                      type="button"
                      disabled={!canSaveAndImport}
                      onClick={() => void handleSaveAndImport()}
                      className="gap-2 bg-emerald-600 px-6 text-white shadow-sm hover:bg-emerald-700"
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Save and Import
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(step === "done" ||
            (job?.status === "failed" && step !== "preview")) &&
            showErrorDownload && (
              <Button
                variant="outline"
                onClick={() => void handleDownloadErrors()}
              >
                Download error report
              </Button>
            )}

          {step === "done" && (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
              Import completed successfully.
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-lg">Recent imports</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory/products/import/history">
                View all history
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Link
                        href={`/inventory/products/import/${h.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {h.fileName ?? h.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(h.status) as "default"}>
                        {h.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{h.totalRows}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(h.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

function EditablePreviewCell({
  row,
  column,
  editingCell,
  editValue,
  onStartEdit,
  onChange,
  onSave,
  onCancel,
}: {
  row: ImportJobRow;
  column: ImportPreviewColumn;
  editingCell: EditingCell;
  editValue: string;
  onStartEdit: (row: ImportJobRow, field: ImportPreviewField) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const value = cellValue(row, column.field);
  const isEditing =
    editingCell?.rowId === row.id && editingCell.field === column.field;
  const inputType = DATE_FIELDS.has(column.field)
    ? "date"
    : NUMBER_FIELDS.has(column.field)
      ? "number"
      : "text";
  const inputStep = MONEY_FIELDS.has(column.field)
    ? "0.01"
    : NUMBER_FIELDS.has(column.field)
      ? "1"
      : undefined;

  return (
    <TableCell
      className={`cursor-pointer ${alignClass(column.align)} ${
        column.className ?? ""
      }`}
      onClick={() => {
        if (!isEditing) onStartEdit(row, column.field);
      }}
    >
      {isEditing ? (
        <Input
          autoFocus
          type={inputType}
          step={inputStep}
          value={editValue}
          onChange={onChange}
          onBlur={onSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className={`h-8 min-w-[90px] border-blue-500 bg-white px-2 py-1 text-slate-900 shadow-none focus-visible:ring-blue-500/30 ${alignClass(
            column.align,
          )}`}
        />
      ) : column.field === "unit" && value ? (
        <Badge variant="outline" className="text-xs">
          {value}
        </Badge>
      ) : (
        formatCellValue(column.field, value)
      )}
    </TableCell>
  );
}

function RowIssueSummary({ row }: { row: ImportJobRow }) {
  const errors = row.validationResult?.errors ?? [];
  const warnings = row.validationResult?.warnings ?? [];
  const action = row.validationResult?.action ?? "ready";
  if (!errors.length && !warnings.length) {
    return (
      <Badge variant="outline" className="text-xs capitalize text-slate-600">
        {action.replace(/_/g, " ")}
      </Badge>
    );
  }

  return (
    <div className="space-y-1 whitespace-normal">
      {errors.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className="text-red-700">
          {issue.message}
        </div>
      ))}
      {warnings.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className="text-amber-700">
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`text-xl font-semibold ${danger && value > 0 ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
