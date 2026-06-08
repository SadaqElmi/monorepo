import type {
  ImportCenterDashboard,
  ImportCenterFiltersQuery,
  ImportCenterJobListItem,
  ImportJobListItem,
  ImportType,
} from "@/lib/services/imports";
import { LEGACY_IMPORT_TYPE_LABEL } from "@/lib/services/imports";

export type ImportCenterPageData = {
  dashboard: ImportCenterDashboard;
  jobs: { jobs: ImportCenterJobListItem[]; total: number };
  failed: { jobs: ImportJobListItem[]; total: number };
  filters: ImportCenterFiltersQuery;
  pageNum: number;
  pageSize: number;
};

export const IMPORT_JOB_DETAIL_BASE: Record<ImportType, string> = {
  product: "/inventory/products/import",
  opening_stock: "/inventory/opening-stock/import",
};

export function importJobDetailPath(
  importType: string,
  jobId: string,
): string | null {
  if (importType in LEGACY_IMPORT_TYPE_LABEL) return null;
  const base = IMPORT_JOB_DETAIL_BASE[importType as ImportType];
  if (!base) return null;
  return `${base}/${jobId}`;
}

export const IMPORT_TYPE_LABEL: Record<ImportType, string> = {
  product: "Product",
  opening_stock: "Opening stock",
};

export function legacyImportTypeLabel(importType: string): string {
  return (
    IMPORT_TYPE_LABEL[importType as ImportType] ??
    LEGACY_IMPORT_TYPE_LABEL[importType] ??
    "Unknown"
  );
}

export const IMPORT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  validating: "Validating",
  preview: "Preview",
  confirmed: "Confirmed",
  committing: "Committing",
  completed: "Completed",
  failed: "Failed",
  reversed: "Rolled back",
};

export function formatImportDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function importRowStats(summary: {
  totalRows?: number;
  errorRows?: number;
  warningRows?: number;
  skipRows?: number;
} | null): { success: number; failed: number; warnings: number } {
  if (!summary) {
    return { success: 0, failed: 0, warnings: 0 };
  }
  const total = summary.totalRows ?? 0;
  const failed = summary.errorRows ?? 0;
  const warnings = summary.warningRows ?? 0;
  const skip = summary.skipRows ?? 0;
  const success = Math.max(0, total - failed - skip);
  return { success, failed, warnings };
}

export function permissionForImportType(importType: string): string {
  switch (importType) {
    case "opening_stock":
      return "import_opening_stock";
    default:
      return "import_products";
  }
}

export type ImportCenterSearchParams = {
  importType?: string;
  status?: string;
  from?: string;
  to?: string;
  createdBy?: string;
  /** URL query page (string) */
  page?: string;
};

/** Client-side filter → URL builder (numeric page index). */
export type ImportCenterQueryInput = Omit<ImportCenterSearchParams, "page"> & {
  pageNum?: number;
};

export function parseImportCenterSearchParams(
  raw: Record<string, string | string[] | undefined>,
): ImportCenterSearchParams & { pageNum: number; offset: number; limit: number } {
  const pick = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const pageNum = Math.max(1, Number(pick("page")) || 1);
  const limit = 25;
  return {
    importType: pick("importType"),
    status: pick("status"),
    from: pick("from"),
    to: pick("to"),
    createdBy: pick("createdBy"),
    page: pick("page"),
    pageNum,
    offset: (pageNum - 1) * limit,
    limit,
  };
}

export function importCenterQueryString(params: ImportCenterQueryInput): string {
  const q = new URLSearchParams();
  if (params.importType) q.set("importType", params.importType);
  if (params.status) q.set("status", params.status);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.createdBy) q.set("createdBy", params.createdBy);
  if (params.pageNum != null && params.pageNum > 1) {
    q.set("page", String(params.pageNum));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
