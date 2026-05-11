import { RECONCILIATION_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type ReconciliationLogItem = {
  id: string;
  runId: string;
  type: string;
  entityId: string | null;
  /** Human-readable label (transfer #, branch name, journal summary, …). */
  entityDisplay?: string | null;
  /** Stable code from log metadata (e.g. TR-00012, Branch:Main). */
  entityCode?: string | null;
  severity: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

export type ReconciliationRunSummary = {
  totalIssues?: number;
  /** Units examined across phases (sum of per-phase checked counts). */
  total_checks?: number;
  totalChecks?: number;
  critical?: number;
  warning?: number;
  info?: number;
  bySeverity?: Record<string, number>;
  by_severity?: Record<string, number>;
  by_type?: Record<string, number>;
  byType?: Record<string, number>;
  duration_ms?: number;
  durationMs?: number;
  phase_duration_ms?: Record<string, number>;
  phaseDurationMs?: Record<string, number>;
  errors?: Array<{ phase: string; message: string }>;
  phase_errors?: Array<{ phase: string; message: string }>;
  branchScope?: string[] | "all_branches" | string;
};

export type LatestRunResponse = {
  run: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    summary: ReconciliationRunSummary | null;
  } | null;
};

export type LogsResponse = {
  items: ReconciliationLogItem[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
};

export async function getLatestReconciliationRun(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<LatestRunResponse> {
  return jsonFetch<LatestRunResponse>(`${RECONCILIATION_PREFIX}/runs/latest`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

export async function getReconciliationLogs(
  tenantSlug: string,
  opts?: {
    runId?: string;
    severity?: string;
    type?: string;
    limit?: number;
    offset?: number;
    page?: number;
  },
  init?: Pick<RequestInit, "signal">,
): Promise<LogsResponse> {
  const q = new URLSearchParams();
  if (opts?.runId) q.set("runId", opts.runId);
  if (opts?.severity) q.set("severity", opts.severity);
  if (opts?.type) q.set("type", opts.type);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  if (opts?.page != null) q.set("page", String(opts.page));
  const qs = q.toString();
  return jsonFetch<LogsResponse>(
    `${RECONCILIATION_PREFIX}/logs${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function runFullReconciliation(
  tenantSlug: string,
): Promise<{ runId: string; summary: ReconciliationRunSummary }> {
  return jsonFetch<{ runId: string; summary: ReconciliationRunSummary }>(
    `${RECONCILIATION_PREFIX}/run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant": tenantSlug,
      } as JsonHeaders,
      body: JSON.stringify({}),
    },
  );
}
