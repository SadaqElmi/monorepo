export type ImportType = 'product' | 'opening_stock';

export const IMPORT_TYPES: ImportType[] = ['product', 'opening_stock'];

/** Display labels for retired import types still visible in Import Center history. */
export const LEGACY_IMPORT_TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
};

export type ImportJobStatus =
  | 'draft'
  | 'validating'
  | 'preview'
  | 'confirmed'
  | 'committing'
  | 'completed'
  | 'failed'
  | 'reversed';

export type ImportRowCommitStatus =
  | 'pending'
  | 'committed'
  | 'failed'
  | 'skipped'
  | 'reversed';

export type ProductImportRowAction =
  | 'create_product'
  | 'update_product'
  | 'skip';

export type OpeningStockImportRowAction = 'opening_stock' | 'skip';

export type ImportRowAction =
  | ProductImportRowAction
  | OpeningStockImportRowAction;

export type ImportValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
};

export type ImportRowValidationResult = {
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
  action?: ImportRowAction;
  matchedProductId?: string | null;
  willCreateCategory?: boolean;
  willCreateSupplier?: boolean;
  resolvedCategoryPath?: string | null;
  resolvedBranchId?: string | null;
  resolvedSupplierId?: string | null;
};

export type ParsedProductImportRow = {
  itemNo: string;
  barcode: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  formulation: string | null;
  categoryPath: string | null;
  unit: string | null;
  purchaseUom?: string | null;
  salesUom?: string | null;
  posUom?: string | null;
  stripFactor?: number | null;
  boxFactor?: number | null;
  cartonFactor?: number | null;
  pcsPrice?: number | null;
  stripPrice?: number | null;
  boxPrice?: number | null;
  pcsBarcode?: string | null;
  stripBarcode?: string | null;
  boxBarcode?: string | null;
  description: string | null;
};

export type ParsedOpeningStockImportRow = {
  branchCode: string;
  itemNo: string;
  openingQty: number;
  costPrice: number;
  batchNumber: string | null;
  expiryDate: string | null;
  openingDate: string;
  listPrice: number | null;
};

export type ParsedImportRow =
  | ParsedProductImportRow
  | ParsedOpeningStockImportRow;

export type ImportJobSummary = {
  totalRows: number;
  errorRows: number;
  warningRows: number;
  skipRows: number;
  createProducts?: number;
  updateProducts?: number;
  openingStockRows?: number;
};

export type ImportJobRow = {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  parsedData: ParsedImportRow | null;
  validationResult: ImportRowValidationResult | null;
  commitStatus: ImportRowCommitStatus;
  commitError: string | null;
  resolvedProductId: string | null;
  resolvedBatchId?: string | null;
  openingStockRecordId?: string | null;
  resolvedPurchaseId?: string | null;
};

export type ImportJobRowCounts = {
  committed: number;
  failed: number;
  skipped: number;
  reversed: number;
  pending: number;
};

export type ImportJobDetailRow = ImportJobRow & {
  resolvedBatchId: string | null;
  openingStockRecordId: string | null;
  resolvedPurchaseId: string | null;
};

export type ImportJobDetailResponse = {
  job: ImportJob;
  progress: {
    phase: string;
    processed: number;
    total: number;
    message?: string;
  } | null;
  rowCounts: ImportJobRowCounts;
  rows: ImportJobDetailRow[];
  page: number;
  pageSize: number;
  totalPages: number;
  canDownloadErrors: boolean;
  canReverse: boolean;
  reverseBlockReason: string | null;
};

export type ImportJob = {
  id: string;
  importType: ImportType | string;
  status: ImportJobStatus;
  fileName: string | null;
  fileSha256: string | null;
  policySnapshot: Record<string, unknown>;
  summary: ImportJobSummary | null;
  totalRows: number;
  processedRows: number;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  createdBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  committedAt: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportProgress = {
  phase: string;
  processed: number;
  total: number;
  message?: string;
};

export type ImportPreviewResponse = {
  job: ImportJob;
  summary: ImportJobSummary;
  rows: ImportJobRow[];
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CommitChunkResult = {
  processed: number;
  committed: number;
  failed: number;
  done: boolean;
};

export type ImportContext = {
  schemaName: string;
  tenantId: string;
  userId: string | null;
  allowedBranchIds: string[];
  permissionCodes: string[];
  businessType: string;
  importPolicies: Record<string, unknown>;
};

export type ImportJobActor = {
  id: string;
  name: string | null;
  email: string | null;
};

export type ImportJobListItem = ImportJob & {
  createdByUser: ImportJobActor | null;
  confirmedByUser: ImportJobActor | null;
  reversedByUser: ImportJobActor | null;
};

export type ImportCenterFilters = {
  importType?: ImportType;
  status?: ImportJobStatus;
  from?: string;
  to?: string;
  createdBy?: string;
  limit?: number;
  offset?: number;
};

export type ImportCenterDashboard = {
  total: number;
  running: number;
  completed: number;
  failed: number;
  rolledBack: number;
  byType: Record<ImportType, number>;
  legacyByType: Record<string, number>;
};

export type ImportCenterJobListItem = ImportJobListItem & {
  durationSeconds: number | null;
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

export type ImportJobHistoryDetail = ImportJobDetailResponse & {
  createdByUser: ImportJobActor | null;
  confirmedByUser: ImportJobActor | null;
  reversedByUser: ImportJobActor | null;
  auditEvents: ImportAuditEvent[];
};

export function permissionForImportType(importType: string): string {
  switch (importType) {
    case 'opening_stock':
      return 'import_opening_stock';
    default:
      return 'import_products';
  }
}

export function legacyImportTypeLabel(importType: string): string {
  return LEGACY_IMPORT_TYPE_LABELS[importType] ?? 'Unknown';
}
