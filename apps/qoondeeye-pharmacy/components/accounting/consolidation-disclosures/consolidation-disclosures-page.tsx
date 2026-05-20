"use client";

import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { getStoredUser } from "@/lib/auth-client";
import {
  getConsolidationEntities,
  getDisclosureConsolidationAdjustments,
  getDisclosureFxImpact,
  getDisclosureIntercompanyElimination,
  getDisclosureNci,
  type ConsolidationEntityItem,
} from "@/lib/services/accounting";
import { validateReportAsOf } from "@/lib/report-date-validation";

import { ConsolidationDisclosuresFilters } from "./consolidation-disclosures-filters";
import { ConsolidationDisclosuresResultCard } from "./consolidation-disclosures-result-card";
import {
  disclosureTabTitle,
  periodFromDate,
  todayStr,
  type DisclosureTab,
} from "./utils";

export type ConsolidationDisclosuresPageProps = {
  initialEntities?: ConsolidationEntityItem[];
  initialPayload?: Record<string, unknown> | null;
  initialTab?: DisclosureTab;
  initialToDate?: string;
  initialEntityId?: string;
  serverPrefetched?: boolean;
};

export default function ConsolidationDisclosuresPage({
  initialEntities = [],
  initialPayload = null,
  initialTab = "nci",
  initialToDate,
  initialEntityId = "",
  serverPrefetched = false,
}: ConsolidationDisclosuresPageProps) {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "pharmacy1";
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [toDate, setToDate] = React.useState(initialToDate ?? todayStr);
  const [entities, setEntities] =
    React.useState<ConsolidationEntityItem[]>(initialEntities);
  const [entityId, setEntityId] = React.useState(initialEntityId);
  const [tab, setTab] = React.useState<DisclosureTab>(initialTab);
  const [payload, setPayload] = React.useState<Record<string, unknown> | null>(
    initialPayload,
  );
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const skipInitialLoadRef = React.useRef(serverPrefetched && initialPayload !== null);

  const baseScopeHash = React.useMemo(
    () => `agg:${aggregateAll ? 1 : 0}|branch:${branchId ?? "none"}`,
    [aggregateAll, branchId],
  );
  const scopeHash = entityId ? `scope:entity:${entityId}` : baseScopeHash;
  const periodKey = periodFromDate(toDate);

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

  const load = React.useCallback(async () => {
    const asOfCheck = validateReportAsOf(toDate);
    if (!asOfCheck.ok) {
      setErr(asOfCheck.message);
      return;
    }
    setLoading(true);
    setErr(null);
    if (!skipInitialLoadRef.current) {
      setPayload(null);
    }
    try {
      const pk = periodKey;
      if (tab === "nci") {
        setPayload(await getDisclosureNci(tenantSlug, scopeHash, pk));
      } else if (tab === "fx") {
        setPayload(await getDisclosureFxImpact(tenantSlug, scopeHash, pk));
      } else if (tab === "adj") {
        setPayload(
          await getDisclosureConsolidationAdjustments(tenantSlug, scopeHash, pk),
        );
      } else {
        setPayload(
          await getDisclosureIntercompanyElimination(tenantSlug, scopeHash, pk),
        );
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load disclosure.");
    } finally {
      setLoading(false);
      skipInitialLoadRef.current = false;
    }
  }, [periodKey, scopeHash, tab, tenantSlug, toDate]);

  React.useEffect(() => {
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      return;
    }
    void load();
  }, [load]);

  const tabTitle = disclosureTabTitle(tab);

  return (
    <div className="space-y-4">
      <ConsolidationDisclosuresFilters
        toDate={toDate}
        onToDateChange={setToDate}
        periodKey={periodKey}
        entities={entities}
        entityId={entityId}
        onEntityIdChange={setEntityId}
        loading={loading}
        onRefresh={() => void load()}
        tab={tab}
        onTabChange={setTab}
        scopeHash={scopeHash}
      />

      {err ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <ConsolidationDisclosuresResultCard
        tabTitle={tabTitle}
        loading={loading}
        tab={tab}
        payload={payload}
      />
    </div>
  );
}
