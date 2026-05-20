"use client";

import * as React from "react";
import { format, startOfMonth } from "date-fns";

import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { getStoredUser } from "@/lib/auth-client";
import {
  createConsolidationRunSchema,
  validateForSubmit,
} from "@/lib/validation";
import {
  approveConsolidationAdjustment,
  createConsolidationAdjustment,
  createConsolidationRun,
  downloadAuditPackageZip,
  finalizeConsolidationRun,
  getConsolidationAdjustments,
  getConsolidationEntities,
  getFxRates,
  getConsolidationPreview,
  getConsolidationRunDetail,
  getConsolidationRuns,
  reverseConsolidationRun,
  type ConsolidationEntityItem,
  type ConsolidationRunItem,
} from "@/lib/services/accounting";

import { ConsolidationErrorAlert } from "./consolidation-error-alert";
import { ConsolidationRunDetailSection } from "./consolidation-run-detail-section";
import { ConsolidationRunHistoryCard } from "./consolidation-run-history-card";
import { ConsolidationRunsFormCard } from "./consolidation-runs-form-card";
import type { ConsolidationRunDetailSelected } from "./types";
import { periodFromDate, todayStr } from "./utils";

export type ConsolidationRunsPageProps = {
  initialEntities?: ConsolidationEntityItem[];
  initialRuns?: ConsolidationRunItem[];
  serverPrefetched?: boolean;
};

export default function ConsolidationRunsPage({
  initialEntities = [],
  initialRuns = [],
  serverPrefetched = false,
}: ConsolidationRunsPageProps) {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "pharmacy1";
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [asOfDate, setAsOfDate] = React.useState(todayStr);
  const [fromDate, setFromDate] = React.useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = React.useState(todayStr);
  const [runs, setRuns] = React.useState<ConsolidationRunItem[]>(initialRuns);
  const [entities, setEntities] = React.useState<ConsolidationEntityItem[]>(
    initialEntities,
  );
  const [entityId, setEntityId] = React.useState<string>("");
  const [groupCurrency, setGroupCurrency] = React.useState("USD");
  const [ratePolicy, setRatePolicy] = React.useState<
    "closing" | "average" | "historical"
  >("closing");
  const [includeAdjustments, setIncludeAdjustments] = React.useState(true);
  const [asDraft, setAsDraft] = React.useState(false);
  const [fxRateCount, setFxRateCount] = React.useState(0);
  const [adjustmentsCount, setAdjustmentsCount] = React.useState(0);
  const [selectedRun, setSelectedRun] =
    React.useState<ConsolidationRunDetailSelected | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const baseScopeHash = React.useMemo(
    () =>
      `agg:${aggregateAll ? 1 : 0}|branch:${branchId ?? "none"}`,
    [aggregateAll, branchId],
  );
  const scopeHash = entityId ? `scope:entity:${entityId}` : baseScopeHash;

  const loadRuns = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getConsolidationRuns(tenantSlug, {
        scopeHash,
        entityId: entityId || undefined,
        limit: 50,
      });
      setRuns(res.items);
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Failed to load consolidation runs.",
      );
    } finally {
      setLoading(false);
    }
  }, [scopeHash, tenantSlug, entityId]);

  const skipInitialRunsFetch = React.useRef(serverPrefetched);
  React.useEffect(() => {
    if (skipInitialRunsFetch.current) {
      skipInitialRunsFetch.current = false;
      return;
    }
    void loadRuns();
  }, [loadRuns]);

  React.useEffect(() => {
    if (initialEntities.length > 0) return;
    let cancelled = false;
    void getConsolidationEntities(tenantSlug)
      .then((res) => {
        if (!cancelled) setEntities(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initialEntities.length, tenantSlug]);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getFxRates(tenantSlug, { asOf: toDate }),
      getConsolidationAdjustments(tenantSlug, {
        periodKey: periodFromDate(toDate),
        scopeHash,
        entityId: entityId || undefined,
      }),
    ])
      .then(([fx, adjustments]) => {
        if (cancelled) return;
        setFxRateCount(fx.items.length);
        setAdjustmentsCount(adjustments.items.length);
      })
      .catch(() => {
        if (cancelled) return;
        setFxRateCount(0);
        setAdjustmentsCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, toDate, scopeHash, entityId]);

  async function resolveBranchScopeIds() {
    const preview = await getConsolidationPreview(
      tenantSlug,
      asOfDate,
      branchId,
      aggregateAll,
    );
    const maybeScopeMeta = preview.scopeMeta as { branchIds?: unknown } | undefined;
    const branchIds = Array.isArray(maybeScopeMeta?.branchIds)
      ? maybeScopeMeta.branchIds
          .map((value) => String(value))
          .filter((value) => value.length > 0)
      : [];
    if (branchIds.length <= 1) {
      throw new Error(
        "Consolidation requires multiple branches. Use aggregate-all or a multi-branch scope.",
      );
    }
    return branchIds;
  }

  async function onRunConsolidation() {
    setSubmitting(true);
    setErr(null);
    try {
      const runBody = {
        periodKey: periodFromDate(toDate),
        asOfDate,
        fromDate,
        toDate,
        asOfFxDate: toDate,
        groupCurrency,
        ratePolicy,
        fxPolicy:
          entityId && groupCurrency.trim()
            ? {
                bs: ratePolicy,
                pnl: "average" as const,
                equity: "historical" as const,
              }
            : undefined,
        includeAdjustments,
        scopeHash,
        branchIds: entityId ? undefined : await resolveBranchScopeIds(),
        entityId: entityId || undefined,
        asDraft,
      };
      const validated = validateForSubmit(createConsolidationRunSchema, runBody);
      if (!validated.ok) {
        setErr(validated.message);
        return;
      }
      await createConsolidationRun(tenantSlug, validated.data);
      await loadRuns();
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Failed to post consolidation run.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onFinalize(runId: string) {
    setSubmitting(true);
    setErr(null);
    try {
      await finalizeConsolidationRun(tenantSlug, runId);
      await loadRuns();
      if (selectedRun?.id === runId) {
        const detail = await getConsolidationRunDetail(tenantSlug, runId);
        setSelectedRun(detail);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to finalize run.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDownloadAuditPackage() {
    setSubmitting(true);
    setErr(null);
    try {
      const blob = await downloadAuditPackageZip(tenantSlug, {
        scopeHash,
        periodKey: periodFromDate(toDate),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-package.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to download audit package.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onReverse(runId: string) {
    setSubmitting(true);
    setErr(null);
    try {
      await reverseConsolidationRun(tenantSlug, runId, "manual-ui-reverse");
      await loadRuns();
      if (selectedRun?.id === runId) {
        const detail = await getConsolidationRunDetail(tenantSlug, runId);
        setSelectedRun(detail);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to reverse run.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSelectRun(runId: string) {
    setSubmitting(true);
    setErr(null);
    try {
      const detail = await getConsolidationRunDetail(tenantSlug, runId);
      setSelectedRun(detail);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load run detail.");
      setSelectedRun(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function onQuickAdjustment() {
    setSubmitting(true);
    setErr(null);
    try {
      const created = await createConsolidationAdjustment(tenantSlug, {
        periodKey: periodFromDate(toDate),
        scopeHash,
        entityId: entityId || undefined,
        title: "Manual consolidation adjustment",
        justification: "UI quick entry",
        lines: [
          {
            accountKey: "equity_retained",
            debit: 0,
            credit: 100,
            memo: "Sample",
          },
          {
            accountKey: "operating_expense",
            debit: 100,
            credit: 0,
            memo: "Sample",
          },
        ],
      });
      await approveConsolidationAdjustment(tenantSlug, created.id);
      const adjustments = await getConsolidationAdjustments(tenantSlug, {
        periodKey: periodFromDate(toDate),
        scopeHash,
        entityId: entityId || undefined,
      });
      setAdjustmentsCount(adjustments.items.length);
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Failed to create quick adjustment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ConsolidationRunsFormCard
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        fromDate={fromDate}
        onFromDateChange={setFromDate}
        toDate={toDate}
        onToDateChange={setToDate}
        entityId={entityId}
        onEntityIdChange={setEntityId}
        entities={entities}
        groupCurrency={groupCurrency}
        onGroupCurrencyChange={setGroupCurrency}
        ratePolicy={ratePolicy}
        onRatePolicyChange={setRatePolicy}
        includeAdjustments={includeAdjustments}
        onIncludeAdjustmentsChange={setIncludeAdjustments}
        asDraft={asDraft}
        onAsDraftChange={setAsDraft}
        onRunConsolidation={() => void onRunConsolidation()}
        onRefresh={() => void loadRuns()}
        onQuickAdjustment={() => void onQuickAdjustment()}
        onDownloadAuditPackage={() => void onDownloadAuditPackage()}
        submitting={submitting}
        loading={loading}
        fxRateCount={fxRateCount}
        adjustmentsCount={adjustmentsCount}
      />

      {err ? <ConsolidationErrorAlert message={err} /> : null}

      <ConsolidationRunHistoryCard
        runs={runs}
        loading={loading}
        submitting={submitting}
        onSelectRun={onSelectRun}
        onFinalize={onFinalize}
        onReverse={onReverse}
      />

      <ConsolidationRunDetailSection selectedRun={selectedRun} />
    </div>
  );
}
