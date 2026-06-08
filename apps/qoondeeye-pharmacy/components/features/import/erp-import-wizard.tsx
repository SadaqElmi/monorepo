"use client";

import {
  type ChangeEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  X,
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
import { getStoredUser } from "@/lib/auth-client";
import {
  confirmAndCommitImportJob,
  downloadImportErrorsExport,
  downloadImportTemplate,
  getImportPreview,
  updateImportPreviewRows,
  uploadImportJob,
  validateImportJob,
  type ImportJob,
  type ImportJobRow,
  type ImportJobSummary,
  type ImportType,
} from "@/lib/services/imports";
import { invalidateErpCatalogQueries } from "@/lib/invalidate-erp-catalog";
import { useQueryClient } from "@tanstack/react-query";

import { ImportEditablePreviewGrid } from "./import-editable-preview-grid";
import {
  cellValue,
  normalizeEditValue,
  rawRowsSignature,
  type ImportWizardColumn,
} from "./import-preview-utils";

export type { ImportWizardColumn };

export type ErpImportWizardConfig = {
  importType: ImportType;
  title: string;
  description: string;
  docHref: string;
  historyHref: string;
  /** Base path for job detail pages, e.g. /inventory/products/import */
  jobDetailBasePath: string;
  templateFilename: string;
  columns: ImportWizardColumn[];
};

type WizardStep =
  | "template"
  | "upload"
  | "validate"
  | "preview"
  | "confirm"
  | "commit"
  | "done";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

export function ErpImportWizard({ config }: { config: ErpImportWizardConfig }) {
  const queryClient = useQueryClient();
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const skipBlurSaveRef = useRef(false);

  const [step, setStep] = useState<WizardStep>("template");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [summary, setSummary] = useState<ImportJobSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportJobRow[]>([]);
  const [originalPreviewRows, setOriginalPreviewRows] = useState<ImportJobRow[]>(
    [],
  );
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const errorCount = summary?.errorRows ?? job?.summary?.errorRows ?? 0;
  const canEditPreview =
    (job?.status === "preview" || job?.status === "failed") &&
    (step === "preview" || step === "confirm");

  const onDownloadTemplate = async () => {
    setError(null);
    setBusy(true);
    try {
      const blob = await downloadImportTemplate(tenantSlug, config.importType);
      downloadBlob(blob, config.templateFilename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = useCallback(
    async (jobId: string) => {
      const preview = await getImportPreview(tenantSlug, jobId, 1, 100);
      setPreviewRows(preview.rows);
      setOriginalPreviewRows(preview.rows);
      setSummary(preview.summary);
      setEditingCell(null);
      setEditValue("");
      return preview;
    },
    [tenantSlug],
  );

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    setSummary(null);
    setPreviewRows([]);
    setOriginalPreviewRows([]);
    try {
      const { job: uploaded } = await uploadImportJob(
        tenantSlug,
        config.importType,
        file,
      );
      setJob(uploaded);
      setStep("validate");
      const validated = await validateImportJob(tenantSlug, uploaded.id);
      setJob(validated.job);
      setSummary(validated.job.summary);
      await loadPreview(uploaded.id);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleCellClick = useCallback((row: ImportJobRow, field: string) => {
    setEditingCell({ rowId: row.id, field });
    setEditValue(cellValue(row, field));
  }, []);

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

  const handleSavePreview = async () => {
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
        setJob(preview.job);
        setSummary(preview.summary);
        setPreviewRows(preview.rows);
        setOriginalPreviewRows(preview.rows);
        currentSummary = preview.summary;
      }

      if ((currentSummary?.errorRows ?? 0) > 0) {
        setStep("preview");
        setError("Fix the highlighted validation errors before continuing.");
        return;
      }

      if (job.status !== "preview" && job.status !== "failed") {
        setError(`Import is not ready (status: ${job.status}).`);
        setStep("preview");
        return;
      }

      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    setStep("commit");
    try {
      const { job: committed, progress } = await confirmAndCommitImportJob(
        tenantSlug,
        job.id,
      );
      setJob(committed);
      if (committed.status === "completed") {
        setStep("done");
        await invalidateErpCatalogQueries(queryClient);
      } else if (committed.status === "failed") {
        setError(
          committed.errorMessage ?? progress?.message ?? "Import failed",
        );
        setStep("preview");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelConfirm = () => {
    setStep("preview");
    setError(null);
  };

  const displaySummary = summary ?? job?.summary;

  const guidanceBanner =
    config.importType === "product" ? (
      <p>
        Catalog and UOM setup only — no inventory or accounting. Use{" "}
        <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/40">
          base_uom
        </code>{" "}
        for the stock unit; optional columns configure purchase/sales/POS defaults
        and pack conversions. For stock use{" "}
        <Link href="/inventory/opening-stock/import" className="underline">
          Opening stock import
        </Link>
        .
      </p>
    ) : (
      <p>
        Migration / go-live tool (admin only). Does not create products — import
        the catalog first. Affects inventory and opening balance equity journals.
      </p>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="rounded-md border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        {guidanceBanner}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {config.description}{" "}
            <Link href={config.docHref} className="text-primary underline">
              Column reference
            </Link>
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={config.historyHref}>
            <History className="mr-2 h-4 w-4" />
            History
          </Link>
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Download template</CardTitle>
          <CardDescription>
            Use the current template for this import type only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onDownloadTemplate} disabled={busy}>
            <Download className="mr-2 h-4 w-4" />
            Download Excel template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Upload file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-8 hover:bg-muted/50">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">Choose Excel file</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onUpload}
              disabled={busy}
            />
          </label>
        </CardContent>
      </Card>

      {step === "validate" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Validating rows…
        </div>
      )}

      {step === "commit" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Committing import…
        </div>
      )}

      {job && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Job {job.id.slice(0, 8)}</CardTitle>
              <CardDescription>
                Status: <Badge variant="secondary">{job.status}</Badge>
                {job.fileName ? ` · ${job.fileName}` : null}
              </CardDescription>
            </div>
            {job.status === "completed" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${config.jobDetailBasePath}/${job.id}`}>
                  View detail
                </Link>
              </Button>
            )}
          </CardHeader>
          {displaySummary && step !== "confirm" && (
            <CardContent className="flex flex-wrap gap-4 text-sm">
              <span>Rows: {displaySummary.totalRows}</span>
              <span>Errors: {displaySummary.errorRows}</span>
              {displaySummary.createProducts != null && (
                <span>Create: {displaySummary.createProducts}</span>
              )}
              {displaySummary.updateProducts != null && (
                <span>Update: {displaySummary.updateProducts}</span>
              )}
              {displaySummary.openingStockRows != null && (
                <span>Opening stock: {displaySummary.openingStockRows}</span>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {previewRows.length > 0 && step === "preview" && canEditPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Review and edit</CardTitle>
            <CardDescription>
              Click cells to edit. Save to re-validate before confirming the
              import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {displaySummary && (
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryTile label="Total rows" value={displaySummary.totalRows} />
                {displaySummary.createProducts != null && (
                  <SummaryTile
                    label="Creates"
                    value={displaySummary.createProducts}
                  />
                )}
                {displaySummary.updateProducts != null && (
                  <SummaryTile
                    label="Updates"
                    value={displaySummary.updateProducts}
                  />
                )}
                {displaySummary.openingStockRows != null && (
                  <SummaryTile
                    label="Opening stock"
                    value={displaySummary.openingStockRows}
                  />
                )}
                <SummaryTile
                  label="Errors"
                  value={displaySummary.errorRows}
                  danger
                />
                <SummaryTile label="Warnings" value={displaySummary.warningRows} />
              </div>
            )}

            <ImportEditablePreviewGrid
              columns={config.columns}
              rows={previewRows}
              disabled={busy}
              editingCell={editingCell}
              editValue={editValue}
              onStartEdit={handleCellClick}
              onEditChange={handleCellChange}
              onSaveCell={handleSaveCell}
              onCancelCell={handleCancelCell}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {job && errorCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const blob = await downloadImportErrorsExport(
                        tenantSlug,
                        job.id,
                      );
                      downloadBlob(blob, `import-errors-${job.id}.xlsx`);
                    }}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export errors
                  </Button>
                )}
                {hasPreviewEdits && (
                  <Badge variant="outline" className="border-blue-200 text-blue-700">
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
                  className="gap-2"
                >
                  <RotateCcw className="size-4" />
                  Reset changes
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSavePreview()}
                  className="gap-2"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && job && displaySummary && (
        <Card className="border-emerald-200/80">
          <CardHeader>
            <CardTitle className="text-lg">4. Confirm import</CardTitle>
            <CardDescription>
              Validation passed. Review the summary below, then confirm to write
              data or cancel to keep editing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryTile label="Total rows" value={displaySummary.totalRows} />
              {displaySummary.createProducts != null && (
                <SummaryTile
                  label="Creates"
                  value={displaySummary.createProducts}
                />
              )}
              {displaySummary.updateProducts != null && (
                <SummaryTile
                  label="Updates"
                  value={displaySummary.updateProducts}
                />
              )}
              {displaySummary.openingStockRows != null && (
                <SummaryTile
                  label="Opening stock"
                  value={displaySummary.openingStockRows}
                />
              )}
              <SummaryTile label="Skipped" value={displaySummary.skipRows} />
            </div>

            <p className="text-sm text-muted-foreground">
              File: <span className="font-medium text-foreground">{job.fileName}</span>
              {" · "}
              {displaySummary.totalRows} row
              {displaySummary.totalRows === 1 ? "" : "s"} ready to import.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={handleCancelConfirm}
                className="gap-2"
              >
                <X className="size-4" />
                Cancel
              </Button>
              <Button
                disabled={busy || errorCount > 0}
                onClick={() => void handleConfirmImport()}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Confirm import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && job && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="font-medium">Import completed</p>
              <Button variant="link" className="h-auto p-0" asChild>
                <Link href={`${config.jobDetailBasePath}/${job.id}`}>
                  View job detail
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
