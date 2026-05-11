import type { PagedList } from "@repo/types";
import { getClientBranchIdHeaderForApi } from "@/lib/branch-access";
import { sanitizeBranchIdForQuery } from "@/lib/branch-scope";

import {
  ACCOUNTING_PREFIX,
  AUDIT_PREFIX,
  RECONCILIATION_PREFIX,
  REPORTS_PREFIX,
} from "./endpoints";

type ReportCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const reportGetCache = new Map<string, ReportCacheEntry>();
const REPORT_CACHE_TTL_MS = 30_000;

export function computeReportScopeHash(
  branchId?: string,
  aggregateAll?: boolean,
  consolidated?: boolean,
): string {
  const b = sanitizeBranchIdForQuery(branchId);
  const base = `agg:${aggregateAll ? 1 : 0}|branch:${b ?? "none"}|c:${consolidated ? 1 : 0}`;
  let h = 0;
  for (let i = 0; i < base.length; i += 1) {
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function cacheHasScopeHash(urlOrKey: string, scopeHash: string): boolean {
  return urlOrKey.includes(`scopeHash=${encodeURIComponent(scopeHash)}`);
}

/** Invalidate cached report payloads by scope hash (or clear all when omitted). */
export function invalidateReportCache(scopeHash?: string): void {
  if (!scopeHash) {
    reportGetCache.clear();
    return;
  }
  for (const key of reportGetCache.keys()) {
    if (cacheHasScopeHash(key, scopeHash)) {
      reportGetCache.delete(key);
    }
  }
}

/** Invalidate branch-specific and global aggregate scopes after financial writes. */
export function invalidateReportCacheForBranch(branchId?: string): void {
  if (branchId) {
    invalidateReportCache(computeReportScopeHash(branchId, false));
    invalidateReportCache(computeReportScopeHash(branchId, false, true));
  }
  invalidateReportCache(computeReportScopeHash(undefined, true));
  invalidateReportCache(computeReportScopeHash(undefined, true, true));
}

async function fetchReportGet<T>(
  tenantSlug: string,
  url: string,
  init?: Pick<RequestInit, "signal">,
): Promise<T> {
  const cacheKey = `${tenantSlug}|${url}`;
  const now = Date.now();
  const hit = reportGetCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const payload = await jsonFetch<T>(url, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
  reportGetCache.set(cacheKey, {
    value: payload,
    expiresAt: now + REPORT_CACHE_TTL_MS,
  });
  return payload;
}

function appendReportBranchQuery(
  q: URLSearchParams,
  branchId?: string,
  aggregateAll?: boolean,
  opts?: { consolidated?: boolean },
) {
  const b = sanitizeBranchIdForQuery(branchId);
  if (aggregateAll) q.set("aggregateAll", "true");
  else if (b) q.set("branchId", b);
  if (opts?.consolidated) q.set("consolidated", "true");
  q.set(
    "scopeHash",
    computeReportScopeHash(branchId, aggregateAll, opts?.consolidated),
  );
}
import { type JsonHeaders, authPost, jsonFetch } from "./http";

export type ChartOfAccountRow = {
  id: string;
  branch_id: string;
  code: string | null;
  name: string;
  account_type: string;
  account_key: string;
  is_system: boolean;
  payment_method_key: string | null;
  parent_id: string | null;
  created_at: string | null;
};

export type JournalLineRow = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number | string;
  credit: number | string;
  account_name: string;
  account_key: string;
  partner_kind?: string | null;
  partner_id?: string | null;
};

export type JournalEntryRow = {
  id: string;
  branch_id: string;
  entry_date: string;
  description: string | null;
  source_type: string;
  source_id: string | null;
  journal_book_id?: string | null;
  created_at: string | null;
  lines: JournalLineRow[];
};

export async function getChartOfAccounts(
  tenantSlug: string,
  branchId?: string,
): Promise<ChartOfAccountRow[]> {
  const b = sanitizeBranchIdForQuery(branchId);
  const q = b ? `?branchId=${encodeURIComponent(b)}` : "";
  return jsonFetch<ChartOfAccountRow[]>(`${ACCOUNTING_PREFIX}/chart-of-accounts${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getJournalEntries(
  tenantSlug: string,
  branchId?: string,
  limit = 100,
  opts?: { sourceType?: string; from?: string; to?: string },
): Promise<JournalEntryRow[]> {
  const q = new URLSearchParams();
  const jb = sanitizeBranchIdForQuery(branchId);
  if (jb) q.set("branchId", jb);
  q.set("limit", String(limit));
  if (opts?.sourceType) q.set("sourceType", opts.sourceType);
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  return jsonFetch<JournalEntryRow[]>(
    `${ACCOUNTING_PREFIX}/journal-entries?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export type ProfitLossKpis = {
  grossMarginPct: number | null;
  netProfitMarginPct: number | null;
  revenueGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
};

export type IncomeStatementResult = {
  lines: Array<{
    accountType: string;
    accountKey: string;
    name: string;
    amount: number;
    drilldownPath?: string;
  }>;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  /** Cost of goods sold (from journal account_key cogs). */
  cogs: number;
  /** totalRevenue minus cogs. */
  grossProfit: number;
  /** totalExpenses minus cogs (operating and other expenses). */
  otherExpenses: number;
  intercompany?: {
    revenue: number;
    cogs: number;
    expenses: number;
    netIncomeImpact: number;
  };
  netRevenue?: number;
  monthlyBreakdown?: Array<{
    month: string;
    revenue: number;
    expenses: number;
    netIncome: number;
  }>;
  comparison?: {
    fromDate?: string;
    toDate?: string;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  } | null;
  snapshotComparison?: PnlSnapshotComparison | null;
  variance?: {
    vsPeriod: {
      totalRevenue: VarianceMetric;
      totalExpenses: VarianceMetric;
      netIncome: VarianceMetric;
    } | null;
    vsSnapshot: {
      totalRevenue: VarianceMetric;
      totalExpenses: VarianceMetric;
      netIncome: VarianceMetric;
    } | null;
  };
  kpis?: ProfitLossKpis;
  generatedAt?: string;
  elapsedMs?: number;
  exportHooks?: { pdf: string | null; excel: string | null };
  drilldownCheck?: {
    checked: boolean;
    mismatches: number;
    isConsistent: boolean;
  };
  finalization?: {
    isFinal: boolean;
    lockDate: string | null;
  };
  performance?: {
    elapsedMs: number | null;
    thresholdMs: number;
    isSlow: boolean;
  };
  snapshot?: {
    id: string;
    version: number;
    snapshotDate: string;
    createdAt: string;
    updatedAt: string;
    /** Stored delta vs previous snapshot payload (tenant DB). */
    snapshotDiff?: Record<string, unknown> | null;
  };
  consolidationMode?: "preview" | "posted";
  postedConsolidation?: {
    runId: string;
    postedAt: string;
    metadata: Record<string, unknown> | null;
  } | null;
};

export type ReportValidationWarning = {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
};

export type ReportValidationMeta = {
  checkedAt: string;
  latestReconciliationRunId: string | null;
};

export type ReportStatus = "CLEAN" | "WARNING" | "CRITICAL";

export type VarianceDirection = "up" | "down" | "flat";

export type VarianceMetric = {
  current: number;
  baseline: number;
  absolute: number;
  percent: number | null;
  direction: VarianceDirection;
};

export type PnlSnapshotComparison = {
  baselineSnapshotId: string;
  baselineSnapshotDate: string;
  baselineVersion: number;
  baseline: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  deltas: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
};

export type BalanceSheetSnapshotComparison = {
  baselineSnapshotId: string;
  baselineSnapshotDate: string;
  baselineVersion: number;
  baseline: {
    assets: number;
    liabilities: number;
    totalEquity: number;
  };
  deltas: {
    assets: number;
    liabilities: number;
    totalEquity: number;
  };
};

export type CashFlowSnapshotComparison = {
  baselineSnapshotId: string;
  baselineSnapshotDate: string;
  baselineVersion: number;
  baseline: {
    operating: number;
    investing: number;
    financing: number;
    netCashMovement: number;
  };
  deltas: {
    operating: number;
    investing: number;
    financing: number;
    netCashMovement: number;
  };
};

export type ReportEnvelope<T> = T & {
  data: T;
  warnings: ReportValidationWarning[];
  isValid: boolean;
  reportStatus: ReportStatus;
  validation: ReportValidationMeta;
};

export async function getIncomeStatement(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
  opts?: {
    breakdown?: "monthly";
    compareFrom?: string;
    compareTo?: string;
    compareSnapshot?: boolean;
    consolidationMode?: "preview" | "posted";
    entityId?: string;
  },
): Promise<ReportEnvelope<IncomeStatementResult>> {
  const q = new URLSearchParams({ from, to });
  if (opts?.breakdown) q.set("breakdown", opts.breakdown);
  if (opts?.compareFrom) q.set("compareFrom", opts.compareFrom);
  if (opts?.compareTo) q.set("compareTo", opts.compareTo);
  if (opts?.compareSnapshot) q.set("compareSnapshot", "1");
  if (opts?.consolidationMode) {
    q.set("consolidationMode", opts.consolidationMode);
  }
  if (opts?.entityId) q.set("entityId", opts.entityId);
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<ReportEnvelope<IncomeStatementResult>>(
    tenantSlug,
    `${REPORTS_PREFIX}/profit-loss?${q}`,
  );
}

export type BalanceSheetResult = {
  lines: Array<{
    accountType: string;
    accountKey: string;
    name: string;
    balance: number;
    drilldownPath?: string;
  }>;
  totals: {
    assets: number;
    liabilities: number;
    equityFromAccounts: number;
    retainedEarningsImplicit: number;
    totalEquity: number;
    liabilitiesAndEquity: number;
  };
  comparison?: {
    asOf?: string;
    totals: {
      assets: number;
      liabilities: number;
      equityFromAccounts: number;
      retainedEarningsImplicit: number;
      totalEquity: number;
      liabilitiesAndEquity: number;
    };
  } | null;
  snapshotComparison?: BalanceSheetSnapshotComparison | null;
  variance?: {
    vsPeriod: {
      assets: VarianceMetric;
      liabilities: VarianceMetric;
      totalEquity: VarianceMetric;
    } | null;
    vsSnapshot: {
      assets: VarianceMetric;
      liabilities: VarianceMetric;
      totalEquity: VarianceMetric;
    } | null;
  };
  generatedAt?: string;
  elapsedMs?: number;
  exportHooks?: { pdf: string | null; excel: string | null };
  drilldownCheck?: {
    checked: boolean;
    mismatches: number;
    isConsistent: boolean;
    skipReason?: string;
  };
  finalization?: {
    isFinal: boolean;
    lockDate: string | null;
  };
  performance?: {
    elapsedMs: number | null;
    thresholdMs: number;
    isSlow: boolean;
  };
  snapshot?: {
    id: string;
    version: number;
    snapshotDate: string;
    createdAt: string;
    updatedAt: string;
    snapshotDiff?: Record<string, unknown> | null;
  };
  consolidation?: {
    mode: "consolidated";
    reportingMode: "reporting-only";
    grossDueFrom: number;
    grossDueTo: number;
    eliminatedDueFrom: number;
    eliminatedDueTo: number;
    eliminatedAccountKeys?: string[];
    residual: number;
    severity: "clean" | "warning" | "critical";
    consolidationStatus: "clean" | "minor" | "critical";
    messages: string[];
    interbranchBreakdown: InterbranchPairBreakdownRow[];
    transferBreakdown?: InterbranchTransferBreakdownRow[];
  };
  consolidationMode?: "preview" | "posted";
  postedConsolidation?: {
    runId: string;
    postedAt: string;
    metadata: Record<string, unknown> | null;
  } | null;
};

export type InterbranchPairBreakdownRow = {
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  dueFrom: number;
  dueTo: number;
  difference: number;
};

export type InterbranchTransferBreakdownRow = {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  dueFrom: number;
  dueTo: number;
  difference: number;
};

export type InterbranchMismatchItem = {
  kind: "in_transit" | "posted_amount_mismatch" | "transfer_gl_mismatch";
  reasonCode:
    | "timing_in_transit"
    | "journal_total_mismatch"
    | "due_from_to_mismatch";
  fixSuggestionCode:
    | "complete_receive"
    | "repair_transfer_journal"
    | "inspect_due_from_to_mapping";
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  status: string | null;
  shipJournalEntryId: string | null;
  receiveJournalEntryId: string | null;
  shipAmount: number | null;
  receiveAmount: number | null;
  difference: number | null;
  message: string;
};

export type StuckTransferItem = {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  status: string | null;
  shippedAt: string | null;
  hoursInTransit: number;
  reasonCode: "stuck_transfer";
  fixSuggestionCode: "complete_receive";
  message: string;
};

export type ConsolidationPreviewResult = {
  reportingMode: "reporting-only";
  asOfDate: string;
  residual: number;
  proposedLines: Array<{
    accountKey: string;
    branchLabel: string;
    debit: number;
    credit: number;
    memo: string;
  }>;
  interbranchBreakdown: InterbranchPairBreakdownRow[];
  transferBreakdown: InterbranchTransferBreakdownRow[];
  suggestedAction?: string;
  suggestedSummary?: {
    headline: string;
    pairCount: number;
    transferMismatchCount: number;
  };
};

export async function getBalanceSheet(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
  opts?: {
    compareAsOf?: string;
    compareSnapshot?: boolean;
    /** Multi-branch only; server validates scope. */
    consolidated?: boolean;
    consolidationMode?: "preview" | "posted";
    entityId?: string;
  },
): Promise<ReportEnvelope<BalanceSheetResult>> {
  const q = new URLSearchParams({ asOf });
  if (opts?.compareAsOf) q.set("compareAsOf", opts.compareAsOf);
  if (opts?.compareSnapshot) q.set("compareSnapshot", "1");
  if (opts?.consolidationMode) {
    q.set("consolidationMode", opts.consolidationMode);
  }
  if (opts?.entityId) q.set("entityId", opts.entityId);
  appendReportBranchQuery(q, branchId, aggregateAll, {
    consolidated: opts?.consolidated,
  });
  return fetchReportGet<ReportEnvelope<BalanceSheetResult>>(
    tenantSlug,
    `${REPORTS_PREFIX}/balance-sheet?${q}`,
  );
}

export type ConsolidationRunItem = {
  id: string;
  periodKey: string;
  asOfDate: string;
  fromDate: string;
  toDate: string;
  scopeHash: string;
  scopeBranchIds: string[];
  entityId: string | null;
  status: "draft" | "posted" | "finalized" | "reversed";
  createdBy: string | null;
  reversedBy: string | null;
  postedAt: string;
  reversedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ConsolidationFxPolicyBody = {
  bs: "closing" | "average" | "historical";
  pnl: "closing" | "average" | "historical";
  equity: "closing" | "average" | "historical";
};

export type CreateConsolidationRunBody = {
  periodKey: string;
  asOfDate: string;
  fromDate: string;
  toDate: string;
  scopeHash: string;
  branchIds?: string[];
  entityId?: string;
  dryRun?: boolean;
  asDraft?: boolean;
  replaceDraftRunId?: string;
  asOfFxDate?: string;
  groupCurrency?: string;
  /** @deprecated Prefer `fxPolicy`. */
  ratePolicy?: "closing" | "average" | "historical";
  fxPolicy?: ConsolidationFxPolicyBody;
  includeAdjustments?: boolean;
};

export async function createConsolidationRun(
  tenantSlug: string,
  body: CreateConsolidationRunBody,
): Promise<{ run: ConsolidationRunItem; reversedRunId: string | null }> {
  return authPost<{ run: ConsolidationRunItem; reversedRunId: string | null }>(
    `${REPORTS_PREFIX}/consolidation/run`,
    body as Record<string, unknown>,
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

export type FxRateItem = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rateType: "closing" | "average" | "historical" | string;
  rate: number;
  asOfDate: string;
  updatedAt: string;
};

export async function getFxRates(
  tenantSlug: string,
  opts?: {
    asOf?: string;
    fromCurrency?: string;
    toCurrency?: string;
    rateType?: "closing" | "average" | "historical";
  },
): Promise<{ items: FxRateItem[] }> {
  const q = new URLSearchParams();
  if (opts?.asOf) q.set("asOf", opts.asOf);
  if (opts?.fromCurrency) q.set("fromCurrency", opts.fromCurrency);
  if (opts?.toCurrency) q.set("toCurrency", opts.toCurrency);
  if (opts?.rateType) q.set("rateType", opts.rateType);
  return jsonFetch(`${REPORTS_PREFIX}/fx-rates?${q.toString()}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function upsertFxRate(
  tenantSlug: string,
  body: {
    fromCurrency: string;
    toCurrency: string;
    rateType?: "closing" | "average" | "historical";
    rate: number;
    asOfDate: string;
  },
): Promise<{ id: string; rate: number; updatedAt: string; updatedBy: string | null }> {
  return authPost(
    `${REPORTS_PREFIX}/fx-rates`,
    body as Record<string, unknown>,
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

export type ConsolidationAdjustmentItem = {
  id: string;
  period_key: string;
  scope_hash: string;
  entity_id: string | null;
  status: string;
  title: string;
  justification: string | null;
  lines: Array<{ accountKey: string; debit: number; credit: number; memo?: string }>;
  approved_by: string | null;
  approved_at: string | null;
  applied_run_id: string | null;
  created_by: string | null;
  created_at: string;
};

export async function getConsolidationAdjustments(
  tenantSlug: string,
  opts?: { periodKey?: string; scopeHash?: string; entityId?: string; status?: string },
): Promise<{ items: ConsolidationAdjustmentItem[] }> {
  const q = new URLSearchParams();
  if (opts?.periodKey) q.set("periodKey", opts.periodKey);
  if (opts?.scopeHash) q.set("scopeHash", opts.scopeHash);
  if (opts?.entityId) q.set("entityId", opts.entityId);
  if (opts?.status) q.set("status", opts.status);
  return jsonFetch(`${REPORTS_PREFIX}/consolidation-adjustments?${q.toString()}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createConsolidationAdjustment(
  tenantSlug: string,
  body: {
    periodKey: string;
    scopeHash: string;
    entityId?: string;
    title: string;
    justification?: string;
    lines: Array<{ accountKey: string; debit: number; credit: number; memo?: string }>;
  },
): Promise<{ id: string; createdAt: string }> {
  return authPost(
    `${REPORTS_PREFIX}/consolidation-adjustments`,
    body as Record<string, unknown>,
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

export async function approveConsolidationAdjustment(
  tenantSlug: string,
  id: string,
): Promise<{ id: string; status: string; approvedAt: string }> {
  return authPost(
    `${REPORTS_PREFIX}/consolidation-adjustments/${encodeURIComponent(id)}/approve`,
    {},
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

export async function reverseConsolidationRun(
  tenantSlug: string,
  runId: string,
  reason?: string,
): Promise<{ run: ConsolidationRunItem }> {
  return authPost<{ run: ConsolidationRunItem }>(
    `${REPORTS_PREFIX}/consolidation/runs/${encodeURIComponent(runId)}/reverse`,
    reason ? { reason } : {},
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

export async function finalizeConsolidationRun(
  tenantSlug: string,
  runId: string,
): Promise<{ run: ConsolidationRunItem }> {
  return authPost<{ run: ConsolidationRunItem }>(
    `${REPORTS_PREFIX}/consolidation/runs/${encodeURIComponent(runId)}/finalize`,
    {},
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

/** ZIP: audit verify + consolidation runs + audit log sample. */
export async function downloadAuditPackageZip(
  tenantSlug: string,
  opts?: {
    from?: string;
    to?: string;
    scopeHash?: string;
    periodKey?: string;
  },
): Promise<Blob> {
  const q = new URLSearchParams();
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.scopeHash) q.set("scopeHash", opts.scopeHash);
  if (opts?.periodKey) q.set("periodKey", opts.periodKey);
  const headers: Record<string, string> = {
    "X-Tenant": tenantSlug,
  };
  const branchHeader = getClientBranchIdHeaderForApi();
  if (branchHeader) headers["x-branch-id"] = branchHeader;
  const res = await fetch(`${REPORTS_PREFIX}/audit-package?${q}`, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Download failed (${res.status})`);
  }
  return res.blob();
}

export async function getConsolidationRuns(
  tenantSlug: string,
  opts?: {
    scopeHash?: string;
    entityId?: string;
    periodKey?: string;
    limit?: number;
  },
): Promise<{ items: ConsolidationRunItem[]; requestedBy: string | null }> {
  const q = new URLSearchParams();
  if (opts?.scopeHash) q.set("scopeHash", opts.scopeHash);
  if (opts?.entityId) q.set("entityId", opts.entityId);
  if (opts?.periodKey) q.set("periodKey", opts.periodKey);
  if (opts?.limit != null && Number.isFinite(opts.limit)) {
    q.set("limit", String(Math.max(1, Math.floor(opts.limit))));
  }
  return jsonFetch(`${REPORTS_PREFIX}/consolidation/runs?${q.toString()}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getConsolidationRunDetail(
  tenantSlug: string,
  runId: string,
): Promise<
  ConsolidationRunItem & {
    events: Array<{
      id: string;
      eventType: string;
      actorUserId: string | null;
      payload: Record<string, unknown> | null;
      createdAt: string;
    }>;
    journalLinks: Array<{
      id: string;
      journalEntryId: string;
      eliminationType: string;
      accountKey: string | null;
      direction: string | null;
      amount: number;
    }>;
    explain: Record<string, unknown>;
  }
> {
  return jsonFetch(
    `${REPORTS_PREFIX}/consolidation/runs/${encodeURIComponent(runId)}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export type ConsolidationEntityItem = {
  id: string;
  name: string;
  code: string;
  parentEntityId: string | null;
  branchCount: number;
};

export async function getConsolidationEntities(
  tenantSlug: string,
): Promise<{ items: ConsolidationEntityItem[] }> {
  return jsonFetch(`${REPORTS_PREFIX}/entities`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getDisclosureNci(
  tenantSlug: string,
  scopeHash: string,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return jsonFetch(`${REPORTS_PREFIX}/disclosure/nci?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getDisclosureFxImpact(
  tenantSlug: string,
  scopeHash: string,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return jsonFetch(`${REPORTS_PREFIX}/disclosure/fx-impact?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getDisclosureConsolidationAdjustments(
  tenantSlug: string,
  scopeHash: string,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return jsonFetch(`${REPORTS_PREFIX}/disclosure/consolidation-adjustments?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getDisclosureIntercompanyElimination(
  tenantSlug: string,
  scopeHash: string,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return jsonFetch(
    `${REPORTS_PREFIX}/disclosure/intercompany-elimination?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function getInterbranchMismatches(
  tenantSlug: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<{ items: InterbranchMismatchItem[] } & { scopeMeta?: unknown }> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  return jsonFetch(`${REPORTS_PREFIX}/interbranch-mismatches?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getStuckTransfers(
  tenantSlug: string,
  branchId?: string,
  aggregateAll?: boolean,
  olderThanHours?: number,
): Promise<
  { thresholdHours: number; items: StuckTransferItem[] } & { scopeMeta?: unknown }
> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  if (olderThanHours != null && Number.isFinite(olderThanHours)) {
    q.set("olderThanHours", String(Math.max(1, Math.floor(olderThanHours))));
  }
  return jsonFetch(`${REPORTS_PREFIX}/stuck-transfers?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getConsolidationPreview(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
  entityId?: string,
): Promise<ConsolidationPreviewResult & { scopeMeta?: unknown }> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, branchId, aggregateAll);
  if (entityId) q.set("entityId", entityId);
  return jsonFetch(`${REPORTS_PREFIX}/consolidation-preview?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export type CashFlowLine = {
  section: "operating" | "investing" | "financing";
  sourceType: string;
  accountKey: string;
  name: string;
  netMovement: number;
  drilldownPath?: string;
};

export type CashFlowStatementResult = {
  fromDate: string;
  toDate: string;
  sections: {
    operating: CashFlowLine[];
    investing: CashFlowLine[];
    financing: CashFlowLine[];
  };
  sectionTotals: {
    operating: number;
    investing: number;
    financing: number;
  };
  lines: CashFlowLine[];
  netCashMovement: number;
  comparison?: {
    fromDate?: string;
    toDate?: string;
    sectionTotals: {
      operating: number;
      investing: number;
      financing: number;
    };
    netCashMovement: number;
  } | null;
  snapshotComparison?: CashFlowSnapshotComparison | null;
  variance?: {
    vsPeriod: {
      operating: VarianceMetric;
      investing: VarianceMetric;
      financing: VarianceMetric;
      netCashMovement: VarianceMetric;
    } | null;
    vsSnapshot: {
      operating: VarianceMetric;
      investing: VarianceMetric;
      financing: VarianceMetric;
      netCashMovement: VarianceMetric;
    } | null;
  };
  generatedAt?: string;
  elapsedMs?: number;
  exportHooks?: { pdf: string | null; excel: string | null };
  finalization?: {
    isFinal: boolean;
    lockDate: string | null;
  };
  performance?: {
    elapsedMs: number | null;
    thresholdMs: number;
    isSlow: boolean;
  };
  snapshot?: {
    id: string;
    version: number;
    snapshotDate: string;
    createdAt: string;
    updatedAt: string;
    snapshotDiff?: Record<string, unknown> | null;
  };
};

export async function getCashFlowStatement(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
  opts?: {
    compareFrom?: string;
    compareTo?: string;
    compareSnapshot?: boolean;
  },
): Promise<ReportEnvelope<CashFlowStatementResult>> {
  const q = new URLSearchParams({ from, to });
  if (opts?.compareFrom) q.set("compareFrom", opts.compareFrom);
  if (opts?.compareTo) q.set("compareTo", opts.compareTo);
  if (opts?.compareSnapshot) q.set("compareSnapshot", "1");
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<ReportEnvelope<CashFlowStatementResult>>(
    tenantSlug,
    `${REPORTS_PREFIX}/cash-flow?${q}`,
  );
}

export type ReportExportFormat = "pdf" | "xlsx";

export type EnqueueReportExportBody = {
  reportType: "profit_loss" | "balance_sheet" | "cash_flow";
  format: ReportExportFormat;
  from?: string;
  to?: string;
  asOf?: string;
  branchId?: string;
  branchIds?: string;
  aggregateAll?: boolean;
  scopeHash?: string;
  consolidated?: boolean;
};

export async function enqueueReportExport(
  tenantSlug: string,
  body: EnqueueReportExportBody,
): Promise<{ id: string; status: "pending" }> {
  return authPost<{ id: string; status: "pending" }>(
    `${REPORTS_PREFIX}/exports`,
    body as Record<string, unknown>,
    { "X-Tenant": tenantSlug } as JsonHeaders,
  );
}

export type ReportExportStatus = {
  id: string;
  status: string;
  reportType: string;
  format: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  downloadReady: boolean;
  retryCount: number;
  maxRetries: number;
};

export async function getReportExportStatus(
  tenantSlug: string,
  jobId: string,
): Promise<ReportExportStatus> {
  return jsonFetch<ReportExportStatus>(
    `${REPORTS_PREFIX}/exports/${encodeURIComponent(jobId)}`,
    { headers: { "X-Tenant": tenantSlug } as JsonHeaders },
  );
}

export function reportExportDownloadUrl(jobId: string): string {
  return `${REPORTS_PREFIX}/exports/${encodeURIComponent(jobId)}/download`;
}

export type TrialBalanceLine = {
  accountKey: string;
  name: string;
  debit: number;
  credit: number;
};

export async function getTrialBalance(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<TrialBalanceLine[]> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<TrialBalanceLine[]>(
    tenantSlug,
    `${REPORTS_PREFIX}/trial-balance?${q}`,
  );
}

export type DashboardSeriesPoint = {
  date: string;
  sales: number;
  expenses: number;
  profit: number;
};

export async function getDashboardSeries(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
  init?: Pick<RequestInit, "signal">,
): Promise<DashboardSeriesPoint[]> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<DashboardSeriesPoint[]>(
    tenantSlug,
    `${REPORTS_PREFIX}/dashboard-series?${q}`,
    init,
  );
}

export type SupplierPaymentRow = {
  id: string;
  branchId: string;
  supplierId: string;
  supplierName: string | null;
  amount: number;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  paymentMethod: string | null;
  createdAt: string | null;
};

export async function getSupplierPayments(
  tenantSlug: string,
  branchId: string,
  limit = 50,
): Promise<SupplierPaymentRow[]> {
  const q = new URLSearchParams({
    branchId,
    limit: String(limit),
  });
  return jsonFetch<SupplierPaymentRow[]>(
    `${ACCOUNTING_PREFIX}/supplier-payments?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function createSupplierPayment(
  tenantSlug: string,
  body: {
    branchId: string;
    supplierId: string;
    amount: number;
    paymentDate: string;
    reference?: string;
    notes?: string;
    paymentMethod?: string;
  },
): Promise<SupplierPaymentRow> {
  const result = await authPost<SupplierPaymentRow>(
    `${ACCOUNTING_PREFIX}/supplier-payments`,
    body,
    {
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
  );
  invalidateReportCacheForBranch(body.branchId);
  return result;
}

export async function createCustomerPayment(
  tenantSlug: string,
  body: {
    branchId: string;
    customerId: string;
    amount: number;
    paymentDate: string;
    reference?: string;
    notes?: string;
    paymentMethod?: string;
    allocations?: Array<{ saleId: string; amount: number }>;
  },
): Promise<CustomerPaymentRow> {
  const result = await authPost<CustomerPaymentRow>(
    `${ACCOUNTING_PREFIX}/customer-payments`,
    body,
    {
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
  );
  invalidateReportCacheForBranch(body.branchId);
  return result;
}

export type InventoryValuationLine = {
  productId: string;
  productName: string | null;
  qty: number;
  unitCost: number;
  lineValue: number;
};

export type InventoryValuationResult = {
  lines: InventoryValuationLine[];
  totalValue: number;
};

export async function getInventoryValuation(
  tenantSlug: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<InventoryValuationResult> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<InventoryValuationResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/inventory-valuation?${q}`,
  );
}

export type TopProductLine = {
  productId: string;
  productName: string | null;
  quantitySold: number;
  revenue: number;
};

export type TopProductsResult = {
  sort: "revenue" | "quantity";
  fromDate: string;
  toDate: string;
  lines: TopProductLine[];
};

export async function getTopProducts(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  limit = 10,
  sort: "revenue" | "quantity" = "revenue",
  aggregateAll?: boolean,
  init?: Pick<RequestInit, "signal">,
): Promise<TopProductsResult> {
  const q = new URLSearchParams({
    from,
    to,
    limit: String(limit),
    sort,
  });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<TopProductsResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/top-products?${q}`,
    init,
  );
}

export type ExecutiveSummaryResult = {
  fromDate: string;
  toDate: string;
  revenue: number;
  netIncome: number;
  grossProfit: number;
  outstandingReceivables: number;
  outstandingPayables: number;
  dailyProfitPoints: number;
};

export async function getExecutiveSummary(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<ExecutiveSummaryResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<ExecutiveSummaryResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/executive-summary?${q}`,
  );
}

export type AgedReceivableResult = {
  asOfDate: string;
  lines: Array<{
    customerId: string;
    customerName: string | null;
    balance: number;
  }>;
};

export async function getAgedReceivable(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<AgedReceivableResult> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<AgedReceivableResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/aged-receivable?${q}`,
  );
}

export type AgedPayableResult = {
  asOfDate: string;
  lines: Array<{
    supplierId: string;
    supplierName: string | null;
    balance: number;
  }>;
};

export async function getAgedPayable(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<AgedPayableResult> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<AgedPayableResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/aged-payable?${q}`,
  );
}

export type AuditLogRow = {
  id: string;
  branch_id: string | null;
  actor_user_id: string | null;
  table_name: string;
  record_id: string;
  action: string;
  old_payload: unknown;
  new_payload: unknown;
  created_at: string;
};

export type CloseReadinessIssue = {
  code: string;
  severity: "critical" | "warning" | "info";
  blocking: boolean;
  domain: "interbranch" | "inventory" | "transfer_posting";
  message: string;
  metadata?: Record<string, unknown>;
};

export type CloseReadinessResult = {
  asOfDate: string;
  status: ReportStatus;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    blocking: number;
  };
  issues: CloseReadinessIssue[];
  scopeMeta?: unknown;
};

export type AccountingPeriodWorkflow = {
  scopeHash: string;
  periodKey: string;
  periodEnd: string;
  state: "open" | "review" | "approved" | "closed";
  preparedBy: string | null;
  preparedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  closedAt: string | null;
};

export type InventoryGlSyncRow = {
  branchId: string;
  inventoryValue: number;
  glValue: number;
  difference: number;
  severity: "clean" | "warning" | "critical";
};

export type AlertItem = {
  code: "stuck_transfer" | "interbranch_critical_mismatch" | "inventory_negative_on_hand";
  severity: "warning" | "critical";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type VarianceAnalysisRow = {
  account: string;
  change: number;
  drivers: Array<{ type: string; impact: number }>;
};

export type AuditVerifyIssue = {
  id: string;
  eventTs: string;
  entityType: string;
  entityId: string;
  reason: string;
  expectedPrevHash: string | null;
  actualPrevHash: string | null;
  expectedAuditHash: string | null;
  actualAuditHash: string | null;
};

export type AuditVerifyResult = {
  valid: boolean;
  checkedRows: number;
  lastHash: string | null;
  issues: AuditVerifyIssue[];
  scopeMeta?: unknown;
};

export type ExplainNumberResult = {
  account: string;
  value: number;
  asOfDate: string;
  breakdown: Array<{ type: string; amount: number }>;
  scopeMeta?: unknown;
};

export type HealthSnapshotItem = {
  snapshotHour: string;
  checkKey: string;
  status: "clean" | "warning" | "critical" | "failed";
  summary: Record<string, unknown> | null;
  sourceRunId: string | null;
};

export async function getAuditTrail(
  tenantSlug: string,
  branchId: string,
  limit = 8,
  init?: Pick<RequestInit, "signal">,
): Promise<AuditLogRow[]> {
  const q = new URLSearchParams({
    branchId,
    limit: String(Math.min(500, Math.max(1, limit))),
  });
  return jsonFetch<AuditLogRow[]>(
    `${ACCOUNTING_PREFIX}/audit-trail?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function getAuditTrailPaged(
  tenantSlug: string,
  branchId: string,
  page: number,
  limit: number,
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<AuditLogRow>> {
  const q = new URLSearchParams({
    branchId,
    page: String(Math.max(1, page)),
    limit: String(Math.min(500, Math.max(1, limit))),
  });
  return jsonFetch<PagedList<AuditLogRow>>(
    `${ACCOUNTING_PREFIX}/audit-trail?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function getCloseReadiness(
  tenantSlug: string,
  branchId?: string,
  aggregateAll?: boolean,
  asOf?: string,
): Promise<CloseReadinessResult> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  if (asOf) q.set("asOf", asOf);
  return jsonFetch<CloseReadinessResult>(`${ACCOUNTING_PREFIX}/close-readiness?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function approveAccountingPeriod(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<{ workflow: AccountingPeriodWorkflow; scopeMeta?: unknown }> {
  const body: Record<string, unknown> = { asOf };
  const b = sanitizeBranchIdForQuery(branchId);
  if (aggregateAll) body.aggregateAll = true;
  else if (b) body.branchId = b;
  return authPost(`${ACCOUNTING_PREFIX}/period/approve`, body, {
    "X-Tenant": tenantSlug,
  } as JsonHeaders);
}

export async function reopenAccountingPeriod(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<{ workflow: AccountingPeriodWorkflow; scopeMeta?: unknown }> {
  const body: Record<string, unknown> = { asOf };
  const b = sanitizeBranchIdForQuery(branchId);
  if (aggregateAll) body.aggregateAll = true;
  else if (b) body.branchId = b;
  return authPost(`${ACCOUNTING_PREFIX}/period/reopen`, body, {
    "X-Tenant": tenantSlug,
  } as JsonHeaders);
}

export async function getInventoryGlSync(
  tenantSlug: string,
  asOf?: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<{ asOfDate: string; rows: InventoryGlSyncRow[]; scopeMeta?: unknown }> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  if (asOf?.trim()) q.set("asOf", asOf.trim());
  return jsonFetch(`${REPORTS_PREFIX}/inventory-gl-sync?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getAccountingAlerts(
  tenantSlug: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<{ items: AlertItem[]; scopeMeta?: unknown }> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  return jsonFetch(`${REPORTS_PREFIX}/alerts?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getVarianceAnalysis(
  tenantSlug: string,
  from: string,
  to: string,
  accountKey: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<{ rows: VarianceAnalysisRow[]; scopeMeta?: unknown }> {
  const q = new URLSearchParams({ from, to, accountKey });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return jsonFetch(`${REPORTS_PREFIX}/variance-analysis?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getReportExplain(
  tenantSlug: string,
  accountKey: string,
  asOf?: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<ExplainNumberResult> {
  const q = new URLSearchParams({ accountKey });
  appendReportBranchQuery(q, branchId, aggregateAll);
  if (asOf?.trim()) q.set("asOf", asOf.trim());
  return jsonFetch(`${REPORTS_PREFIX}/explain?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getAuditVerify(
  tenantSlug: string,
  opts?: {
    branchId?: string;
    aggregateAll?: boolean;
    from?: string;
    to?: string;
    limit?: number;
  },
): Promise<AuditVerifyResult> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, opts?.branchId, opts?.aggregateAll);
  if (opts?.from?.trim()) q.set("from", opts.from.trim());
  if (opts?.to?.trim()) q.set("to", opts.to.trim());
  if (opts?.limit != null && Number.isFinite(opts.limit)) {
    q.set("limit", String(Math.max(1, Math.floor(opts.limit))));
  }
  return jsonFetch(`${AUDIT_PREFIX}/verify?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export function getAuditExportUrl(opts?: {
  branchId?: string;
  aggregateAll?: boolean;
  from?: string;
  to?: string;
}): string {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, opts?.branchId, opts?.aggregateAll);
  if (opts?.from?.trim()) q.set("from", opts.from.trim());
  if (opts?.to?.trim()) q.set("to", opts.to.trim());
  return `${AUDIT_PREFIX}/export?${q}`;
}

export async function getIntegrityHealthSnapshots(
  tenantSlug: string,
  opts?: {
    from?: string;
    to?: string;
    checkKey?: string;
    limit?: number;
  },
): Promise<{ items: HealthSnapshotItem[]; limit: number }> {
  const q = new URLSearchParams();
  if (opts?.from?.trim()) q.set("from", opts.from.trim());
  if (opts?.to?.trim()) q.set("to", opts.to.trim());
  if (opts?.checkKey?.trim()) q.set("checkKey", opts.checkKey.trim());
  if (opts?.limit != null && Number.isFinite(opts.limit)) {
    q.set("limit", String(Math.max(1, Math.floor(opts.limit))));
  }
  return jsonFetch(`${RECONCILIATION_PREFIX}/health-snapshots?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export type CustomerPaymentRow = {
  id: string;
  branchId: string;
  customerId: string;
  customerName: string | null;
  amount: number;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  paymentMethod: string | null;
  createdAt: string | null;
};

export async function getCustomerPayments(
  tenantSlug: string,
  branchId: string,
  limit = 50,
): Promise<CustomerPaymentRow[]> {
  const q = new URLSearchParams({
    branchId,
    limit: String(limit),
  });
  return jsonFetch<CustomerPaymentRow[]>(
    `${ACCOUNTING_PREFIX}/customer-payments?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export type JournalLineFlatRow = {
  line_id: string;
  journal_entry_id: string;
  entry_date: string;
  description: string | null;
  source_type: string;
  source_id: string | null;
  account_id: string;
  account_key: string | null;
  account_name: string | null;
  debit: string;
  credit: string;
  partner_kind: string | null;
  partner_id: string | null;
};

export async function getJournalLines(
  tenantSlug: string,
  branchId: string,
  opts?: { from?: string; to?: string; limit?: number; accountKey?: string },
): Promise<JournalLineFlatRow[]> {
  const q = new URLSearchParams({ branchId });
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.accountKey) q.set("accountKey", opts.accountKey);
  return jsonFetch<JournalLineFlatRow[]>(
    `${ACCOUNTING_PREFIX}/journal-lines?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export type JournalAuditResult = {
  asOfDate: string;
  totalDebits: number;
  totalCredits: number;
  difference: number;
  isBalanced: boolean;
  unbalancedEntryIds: string[];
};

export async function getJournalAudit(
  tenantSlug: string,
  branchId: string,
  asOf: string,
): Promise<JournalAuditResult> {
  const q = new URLSearchParams({ branchId, asOf });
  return jsonFetch<JournalAuditResult>(
    `${ACCOUNTING_PREFIX}/journal-audit?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export type JournalBookRow = {
  id: string;
  code: string;
  name: string;
  bookKind: string;
};

export async function getJournalBooks(
  tenantSlug: string,
  branchId: string,
): Promise<JournalBookRow[]> {
  const q = new URLSearchParams({ branchId });
  return jsonFetch<JournalBookRow[]>(
    `${ACCOUNTING_PREFIX}/journal-books?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export type PaymentTermRow = {
  id: string;
  branch_id: string;
  name: string;
  days_until_due: number;
  created_at: string | null;
};

export async function getPaymentTerms(
  tenantSlug: string,
  branchId: string,
): Promise<PaymentTermRow[]> {
  const q = new URLSearchParams({ branchId });
  return jsonFetch<PaymentTermRow[]>(
    `${ACCOUNTING_PREFIX}/payment-terms?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function createPaymentTerm(
  tenantSlug: string,
  body: { branchId: string; name: string; daysUntilDue?: number },
): Promise<PaymentTermRow> {
  return authPost(`${ACCOUNTING_PREFIX}/payment-terms`, body, {
    "X-Tenant": tenantSlug,
  } as JsonHeaders);
}

export type FollowUpLevelRow = {
  id: string;
  branch_id: string;
  name: string;
  days_after_due: number;
  created_at: string | null;
};

export async function getFollowUpLevels(
  tenantSlug: string,
  branchId: string,
): Promise<FollowUpLevelRow[]> {
  const q = new URLSearchParams({ branchId });
  return jsonFetch<FollowUpLevelRow[]>(
    `${ACCOUNTING_PREFIX}/follow-up-levels?${q}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function createFollowUpLevel(
  tenantSlug: string,
  body: { branchId: string; name: string; daysAfterDue?: number },
): Promise<FollowUpLevelRow> {
  return authPost(`${ACCOUNTING_PREFIX}/follow-up-levels`, body, {
    "X-Tenant": tenantSlug,
  } as JsonHeaders);
}

export type PartnerLedgerResult = {
  partnerKind: string;
  partnerId: string;
  fromDate: string;
  toDate: string;
  lines: Array<{
    entryDate: string;
    sourceType: string;
    description: string | null;
    accountKey: string | null;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
};

export async function getPartnerLedger(
  tenantSlug: string,
  branchId: string | undefined,
  partnerKind: "customer" | "supplier",
  partnerId: string,
  from: string,
  to: string,
  aggregateAll?: boolean,
): Promise<PartnerLedgerResult> {
  const q = new URLSearchParams({
    partnerKind,
    partnerId,
    from,
    to,
  });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<PartnerLedgerResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/partner-ledger?${q}`,
  );
}

export type TaxReportResult = {
  fromDate: string;
  toDate: string;
  lines: Array<{ accountKey: string; name: string; amount: number }>;
};

export async function getTaxReport(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<TaxReportResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<TaxReportResult>(tenantSlug, `${REPORTS_PREFIX}/tax?${q}`);
}

export type FiscalReportResult = {
  fromDate: string;
  toDate: string;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
};

export async function getFiscalReport(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<FiscalReportResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<FiscalReportResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/fiscal?${q}`,
  );
}

export type InvoiceAnalysisResult = {
  fromDate: string;
  toDate: string;
  lines: Array<{
    sourceType: string;
    entryCount: number;
    revenue: number;
  }>;
};

export async function getInvoiceAnalysis(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<InvoiceAnalysisResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<InvoiceAnalysisResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/invoice-analysis?${q}`,
  );
}

export type AnalyticReportResult = {
  fromDate: string;
  toDate: string;
  bySourceType: Array<{ sourceType: string; entryCount: number }>;
};

export async function getAnalyticReport(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<AnalyticReportResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return fetchReportGet<AnalyticReportResult>(
    tenantSlug,
    `${REPORTS_PREFIX}/analytic?${q}`,
  );
}

export type BranchAccessSecurityMetrics = {
  branchScope: string;
  from: string;
  to: string;
  totalDenied: number;
  byReason: Record<string, number>;
  blockedCrossBranchAttempts: number;
  branchMismatchRejections: number;
  privilegedMultiBranchUsage: number;
};

export async function getBranchAccessSecurityMetrics(
  tenantSlug: string,
  opts?: { branchId?: string; from?: string; to?: string },
): Promise<BranchAccessSecurityMetrics> {
  const q = new URLSearchParams();
  const b = sanitizeBranchIdForQuery(opts?.branchId);
  if (b) q.set("branchId", b);
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  const query = q.toString();
  return jsonFetch<BranchAccessSecurityMetrics>(
    `${ACCOUNTING_PREFIX}/security/branch-access-metrics${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}
