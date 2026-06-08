import { IMPORTS_PREFIX } from "./endpoints";
import { blobFetch, jsonFetch, type JsonHeaders } from "./http";

export type ImportType = "product" | "opening_stock";

export const LEGACY_IMPORT_TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
};

export type ImportJobStatus =
  | "draft"
  | "validating"
  | "preview"
  | "confirmed"
  | "committing"
  | "completed"
  | "failed"
  | "reversed";

export type ImportJobSummary = {
  totalRows: number;
  errorRows: number;
  warningRows: number;
  skipRows: number;
  createProducts?: number;
  updateProducts?: number;
  openingStockRows?: number;
};

export type ImportValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type ImportJobRow = {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  parsedData: Record<string, unknown> | null;
  validationResult: {
    errors: ImportValidationIssue[];
    warnings: ImportValidationIssue[];
    action?: string;
  } | null;
  commitStatus: string;
  commitError: string | null;
  resolvedProductId: string | null;
  resolvedBatchId?: string | null;
  openingStockRecordId?: string | null;
  resolvedPurchaseId?: string | null;
};

export type ImportJobActor = {
  id: string;
  name: string | null;
  email: string | null;
};

export type ImportJob = {
  id: string;
  importType: string;
  status: ImportJobStatus;
  fileName: string | null;
  summary: ImportJobSummary | null;
  totalRows: number;
  processedRows: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
  committedAt?: string | null;
  reversedAt?: string | null;
};

export type ImportJobListItem = ImportJob & {
  createdByUser?: ImportJobActor | null;
  confirmedByUser?: ImportJobActor | null;
  reversedByUser?: ImportJobActor | null;
};

export type ImportJobRowCounts = {
  committed: number;
  failed: number;
  skipped: number;
  reversed: number;
  pending: number;
};

export type ImportAuditEvent = {
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

export type ImportJobDetailResponse = {
  job: ImportJob;
  progress: ImportProgress | null;
  rowCounts: ImportJobRowCounts;
  rows: ImportJobRow[];
  page: number;
  pageSize: number;
  totalPages: number;
  canDownloadErrors: boolean;
  canReverse: boolean;
  reverseBlockReason: string | null;
  createdByUser: ImportJobActor | null;
  confirmedByUser: ImportJobActor | null;
  reversedByUser: ImportJobActor | null;
  auditEvents: ImportAuditEvent[];
};

export type ImportPreviewResponse = {
  job: ImportJob;
  summary: ImportJobSummary;
  rows: ImportJobRow[];
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ImportProgress = {
  phase: string;
  processed: number;
  total: number;
  message?: string;
};

function headers(tenantSlug: string): JsonHeaders {
  return { "X-Tenant": tenantSlug };
}

const TEMPLATE_PATH: Record<ImportType, string> = {
  product: "product-import/template",
  opening_stock: "opening-stock-import/template",
};

const UPLOAD_PATH: Record<ImportType, string> = {
  product: "product-import/jobs",
  opening_stock: "opening-stock-import/jobs",
};

export async function downloadImportTemplate(
  tenantSlug: string,
  importType: ImportType,
): Promise<Blob> {
  return blobFetch(`${IMPORTS_PREFIX}/${TEMPLATE_PATH[importType]}`, {
    method: "GET",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function uploadImportJob(
  tenantSlug: string,
  importType: ImportType,
  file: File,
): Promise<{ job: ImportJob }> {
  const form = new FormData();
  form.append("file", file);
  const path = `${IMPORTS_PREFIX}/${UPLOAD_PATH[importType]}`;
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: headers(tenantSlug),
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Upload failed");
  }
  return res.json() as Promise<{ job: ImportJob }>;
}

export async function validateImportJob(
  tenantSlug: string,
  jobId: string,
): Promise<{ job: ImportJob }> {
  return jsonFetch(`${IMPORTS_PREFIX}/${jobId}/validate`, {
    method: "POST",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function getImportJob(
  tenantSlug: string,
  jobId: string,
): Promise<{ job: ImportJob; progress: ImportProgress | null }> {
  return jsonFetch(`${IMPORTS_PREFIX}/${jobId}`, {
    method: "GET",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function getImportPreview(
  tenantSlug: string,
  jobId: string,
  page = 1,
  pageSize = 50,
): Promise<ImportPreviewResponse> {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return jsonFetch<ImportPreviewResponse>(
    `${IMPORTS_PREFIX}/${jobId}/preview?${qs}`,
    {
      method: "GET",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

export async function updateImportPreviewRows(
  tenantSlug: string,
  jobId: string,
  rows: Array<{ id: string; rawData: Record<string, unknown> }>,
): Promise<ImportPreviewResponse> {
  return jsonFetch<ImportPreviewResponse>(
    `${IMPORTS_PREFIX}/${jobId}/preview-rows`,
    {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers(tenantSlug),
    },
      tenantSlug,
      body: JSON.stringify({ rows }),
    },
  );
}

export async function confirmImportJob(
  tenantSlug: string,
  jobId: string,
): Promise<{ job: ImportJob }> {
  return jsonFetch<{ job: ImportJob }>(`${IMPORTS_PREFIX}/${jobId}/confirm`, {
    method: "POST",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function commitImportJob(
  tenantSlug: string,
  jobId: string,
): Promise<{ job: ImportJob; progress: ImportProgress | null }> {
  return jsonFetch<{ job: ImportJob; progress: ImportProgress | null }>(
    `${IMPORTS_PREFIX}/${jobId}/commit`,
    {
      method: "POST",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

/** Confirm preview and commit all rows in one request (no polling). */
export async function confirmAndCommitImportJob(
  tenantSlug: string,
  jobId: string,
): Promise<{ job: ImportJob; progress: ImportProgress | null }> {
  return jsonFetch<{ job: ImportJob; progress: ImportProgress | null }>(
    `${IMPORTS_PREFIX}/${jobId}/confirm-and-commit`,
    {
      method: "POST",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

export async function listImportHistory(
  tenantSlug: string,
  importType: ImportType,
  limit = 50,
  offset = 0,
): Promise<{ jobs: ImportJobListItem[]; total: number }> {
  const qs = new URLSearchParams({
    importType,
    limit: String(limit),
    offset: String(offset),
  });
  return jsonFetch<{ jobs: ImportJobListItem[]; total: number }>(
    `${IMPORTS_PREFIX}/history?${qs}`,
    {
      method: "GET",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

/** Product-only job list (`GET /imports`). */
export async function listImportJobs(
  tenantSlug: string,
  limit = 20,
  offset = 0,
): Promise<{ jobs: ImportJob[]; total: number }> {
  const qs = new URLSearchParams({
    importType: "product",
    limit: String(limit),
    offset: String(offset),
  });
  return jsonFetch<{ jobs: ImportJob[]; total: number }>(
    `${IMPORTS_PREFIX}?${qs}`,
    {
      method: "GET",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

export async function getImportJobDetail(
  tenantSlug: string,
  jobId: string,
  page = 1,
  pageSize = 50,
  filter: "all" | "errors" | "committed" = "all",
): Promise<ImportJobDetailResponse> {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter,
  });
  return jsonFetch<ImportJobDetailResponse>(
    `${IMPORTS_PREFIX}/${jobId}/detail?${qs}`,
    {
      method: "GET",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

export async function reverseImportJob(tenantSlug: string, jobId: string) {
  return jsonFetch(`${IMPORTS_PREFIX}/${jobId}/reverse`, {
    method: "POST",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function downloadImportErrorsExport(
  tenantSlug: string,
  jobId: string,
): Promise<Blob> {
  return blobFetch(`${IMPORTS_PREFIX}/${jobId}/errors/export`, {
    method: "GET",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export type ImportCenterDashboard = {
  total: number;
  running: number;
  completed: number;
  failed: number;
  rolledBack: number;
  byType: Record<ImportType, number>;
  legacyByType?: Record<string, number>;
};

export type ImportCenterJobListItem = ImportJobListItem & {
  durationSeconds: number | null;
};

export type ImportCenterFiltersQuery = {
  importType?: ImportType | "purchase";
  status?: ImportJobStatus;
  from?: string;
  to?: string;
  createdBy?: string;
  limit?: number;
  offset?: number;
};

function centerQueryString(filters: ImportCenterFiltersQuery): string {
  const q = new URLSearchParams();
  if (filters.importType) q.set("importType", filters.importType);
  if (filters.status) q.set("status", filters.status);
  if (filters.from) q.set("from", filters.from);
  if (filters.to) q.set("to", filters.to);
  if (filters.createdBy) q.set("createdBy", filters.createdBy);
  if (filters.limit != null) q.set("limit", String(filters.limit));
  if (filters.offset != null) q.set("offset", String(filters.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getImportCenterDashboard(
  tenantSlug: string,
  filters: Omit<ImportCenterFiltersQuery, "limit" | "offset" | "status"> = {},
): Promise<ImportCenterDashboard> {
  return jsonFetch(
    `${IMPORTS_PREFIX}/center/dashboard${centerQueryString(filters)}`,
    {
      method: "GET",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

export async function listImportCenterJobs(
  tenantSlug: string,
  filters: ImportCenterFiltersQuery = {},
): Promise<{ jobs: ImportCenterJobListItem[]; total: number }> {
  return jsonFetch(
    `${IMPORTS_PREFIX}/center/jobs${centerQueryString(filters)}`,
    {
      method: "GET",
      headers: headers(tenantSlug),
      tenantSlug,
    },
  );
}

export type ImportCenterRunningItem = {
  job: ImportJobListItem;
  progress: ImportProgress | null;
  progressPercent: number;
  rowsProcessed: number;
  rowsRemaining: number;
  startedAt: string;
  estimatedCompletion: string | null;
};

export async function listImportCenterRunning(
  tenantSlug: string,
  limit = 20,
): Promise<{ items: ImportCenterRunningItem[] }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  return jsonFetch(`${IMPORTS_PREFIX}/center/running?${qs}`, {
    method: "GET",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function listImportCenterFailed(
  tenantSlug: string,
  limit = 10,
  offset = 0,
): Promise<{ jobs: ImportJobListItem[]; total: number }> {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return jsonFetch(`${IMPORTS_PREFIX}/center/failed?${qs}`, {
    method: "GET",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}

export async function retryImportJob(
  tenantSlug: string,
  jobId: string,
): Promise<{ job: ImportJob }> {
  return jsonFetch(`${IMPORTS_PREFIX}/${jobId}/retry`, {
    method: "POST",
    headers: headers(tenantSlug),
    tenantSlug,
  });
}
