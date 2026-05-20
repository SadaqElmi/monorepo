import "server-only";

import { cache } from "react";

import { appendReportBranchQuery } from "@/lib/accounting-report-query";
import type { ReportPageContext } from "@/lib/server-page-props";
import { serverJsonFetch } from "@/lib/services/server-http";
import { REPORTS_PREFIX } from "@/lib/services/endpoints";

import type {
  AnalyticReportResult,
  AgedPayableResult,
  AgedReceivableResult,
  BalanceSheetResult,
  CashFlowStatementResult,
  ConsolidationPreviewResult,
  ConsolidationRunItem,
  ExecutiveSummaryResult,
  FiscalReportResult,
  IncomeStatementResult,
  InvoiceAnalysisResult,
  InterbranchMismatchItem,
  PartnerLedgerResult,
  ReportEnvelope,
  TaxReportResult,
  TrialBalanceLine,
  VarianceAnalysisRow,
} from "@/lib/services/accounting";

const cachedReportGet = cache(
  async <T>(tenantSlug: string, url: string): Promise<T> =>
    serverJsonFetch<T>(url, { tenantSlug, cacheMode: "report" }),
);

export async function getBalanceSheetServer(
  ctx: ReportPageContext,
  asOf: string,
  opts?: {
    compareAsOf?: string;
    compareSnapshot?: boolean;
    consolidated?: boolean;
    consolidationMode?: "preview" | "posted";
    entityId?: string;
  },
): Promise<ReportEnvelope<BalanceSheetResult>> {
  const q = new URLSearchParams({ asOf });
  if (opts?.compareAsOf) q.set("compareAsOf", opts.compareAsOf);
  if (opts?.compareSnapshot) q.set("compareSnapshot", "1");
  if (opts?.consolidationMode) q.set("consolidationMode", opts.consolidationMode);
  if (opts?.entityId) q.set("entityId", opts.entityId);
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll, {
    consolidated: opts?.consolidated,
  });
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/balance-sheet?${q}`,
  );
}

export async function getIncomeStatementServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
  opts?: {
    breakdown?: "monthly";
    compareFrom?: string;
    compareTo?: string;
    compareSnapshot?: boolean;
    consolidated?: boolean;
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
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll, {
    consolidated: opts?.consolidated,
  });
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/profit-loss?${q}`,
  );
}

export async function getTrialBalanceServer(
  ctx: ReportPageContext,
  asOf: string,
): Promise<TrialBalanceLine[]> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet<TrialBalanceLine[]>(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/trial-balance?${q}`,
  );
}

export async function getConsolidationRunsServer(
  ctx: ReportPageContext,
  opts?: { periodKey?: string; limit?: number },
): Promise<{ items: ConsolidationRunItem[]; requestedBy: string | null }> {
  const q = new URLSearchParams();
  q.set("scopeHash", ctx.scopeHash);
  if (opts?.periodKey) q.set("periodKey", opts.periodKey);
  if (ctx.filters.entityId) q.set("entityId", ctx.filters.entityId);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/consolidation/runs?${q}`,
  );
}

export async function getConsolidationEntitiesServer(tenantSlug: string) {
  return cachedReportGet<{ items: unknown[] }>(
    tenantSlug,
    `${REPORTS_PREFIX}/entities`,
  );
}

export async function getDisclosureNciServer(
  ctx: ReportPageContext,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash: ctx.scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/disclosure/nci?${q}`,
  );
}

export async function getDisclosureFxImpactServer(
  ctx: ReportPageContext,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash: ctx.scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/disclosure/fx-impact?${q}`,
  );
}

export async function getDisclosureConsolidationAdjustmentsServer(
  ctx: ReportPageContext,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash: ctx.scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/disclosure/consolidation-adjustments?${q}`,
  );
}

export async function getDisclosureIntercompanyEliminationServer(
  ctx: ReportPageContext,
  periodKey?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ scopeHash: ctx.scopeHash });
  if (periodKey) q.set("periodKey", periodKey);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/disclosure/intercompany-elimination?${q}`,
  );
}

export async function getCashFlowStatementServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
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
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/cash-flow?${q}`,
  );
}

export async function getVarianceAnalysisServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
  accountKey: string,
): Promise<{ rows: VarianceAnalysisRow[]; scopeMeta?: unknown }> {
  const q = new URLSearchParams({ from, to, accountKey });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/variance-analysis?${q}`,
  );
}

export async function getExecutiveSummaryServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
): Promise<ExecutiveSummaryResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/executive-summary?${q}`,
  );
}

export async function getAgedReceivableServer(
  ctx: ReportPageContext,
  asOf: string,
): Promise<AgedReceivableResult> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/aged-receivable?${q}`,
  );
}

export async function getAgedPayableServer(
  ctx: ReportPageContext,
  asOf: string,
): Promise<AgedPayableResult> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/aged-payable?${q}`,
  );
}

export async function getTaxReportServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
): Promise<TaxReportResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/tax?${q}`,
  );
}

export async function getFiscalReportServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
): Promise<FiscalReportResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/fiscal?${q}`,
  );
}

export async function getInvoiceAnalysisServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
): Promise<InvoiceAnalysisResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/invoice-analysis?${q}`,
  );
}

export async function getAnalyticReportServer(
  ctx: ReportPageContext,
  from: string,
  to: string,
): Promise<AnalyticReportResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/analytic?${q}`,
  );
}

export async function getPartnerLedgerServer(
  ctx: ReportPageContext,
  partnerKind: "customer" | "supplier",
  partnerId: string,
  from: string,
  to: string,
): Promise<PartnerLedgerResult> {
  const q = new URLSearchParams({
    partnerKind,
    partnerId,
    from,
    to,
  });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/partner-ledger?${q}`,
  );
}

export async function getInterbranchMismatchesServer(
  ctx: ReportPageContext,
): Promise<
  { items: InterbranchMismatchItem[] } & { scopeMeta?: unknown }
> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/interbranch-mismatches?${q}`,
  );
}

export async function getConsolidationPreviewServer(
  ctx: ReportPageContext,
  asOf: string,
  entityId?: string,
): Promise<ConsolidationPreviewResult & { scopeMeta?: unknown }> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, ctx.branchId, ctx.aggregateAll);
  if (entityId) q.set("entityId", entityId);
  return cachedReportGet(
    ctx.tenantSlug,
    `${REPORTS_PREFIX}/consolidation-preview?${q}`,
  );
}
