"use client";

import * as React from "react";
import { format, startOfMonth } from "date-fns";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function periodFromDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return format(new Date(), "yyyy-MM");
  return format(d, "yyyy-MM");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "yyyy-MM-dd HH:mm");
}

function fmtAmount(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncId(id: string | null | undefined, head = 8, tail = 4) {
  if (!id) return "—";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

function humanizeKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function statusBadgeVariant(
  status: ConsolidationRunItem["status"],
): React.ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "finalized":
      return "success";
    case "posted":
      return "default";
    case "draft":
      return "outline";
    case "reversed":
      return "destructive";
    default:
      return "secondary";
  }
}

function KvMini({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
        >
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium tabular-nums text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatScalarForDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value) > 1e6 || (Math.abs(value) < 1e-2 && value !== 0)) {
      return value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
    }
    return fmtAmount(value);
  }
  if (typeof value === "string") return value.length ? value : "—";
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object") return "Object";
  return String(value);
}

function NestedObjectFields({
  obj,
  depth = 0,
}: {
  obj: Record<string, unknown>;
  depth?: number;
}) {
  const maxDepth = 4;
  if (depth > maxDepth) {
    return (
      <pre className="max-h-28 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] leading-snug">
        {JSON.stringify(obj)}
      </pre>
    );
  }
  return (
    <div className="space-y-0.5 text-xs">
      {Object.entries(obj).map(([k, v]) => (
        <div
          key={k}
          className="flex gap-2 border-b border-border/40 py-1.5 last:border-b-0"
        >
          <span className="w-[38%] shrink-0 text-muted-foreground">
            {humanizeKey(k)}
          </span>
          <div className="min-w-0 flex-1 wrap-break-word font-mono leading-snug">
            {v !== null && typeof v === "object" && !Array.isArray(v) ? (
              <div className="rounded-md border bg-muted/15 p-2">
                <NestedObjectFields
                  obj={v as Record<string, unknown>}
                  depth={depth + 1}
                />
              </div>
            ) : Array.isArray(v) ? (
              <span>
                {v.length} item(s)
                {v.length > 0 && typeof v[0] === "string" ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {v
                      .slice(0, 5)
                      .map((id) => truncId(String(id)))
                      .join(", ")}
                    {v.length > 5 ? " …" : ""}
                  </span>
                ) : null}
              </span>
            ) : (
              formatScalarForDisplay(v)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunMetadataPanels({
  metadata,
}: {
  metadata: Record<string, unknown> | null;
}) {
  if (!metadata || typeof metadata !== "object") {
    return (
      <p className="text-sm text-muted-foreground">
        No stored computation metadata for this run.
      </p>
    );
  }

  const ownership = metadata.ownership as Record<string, unknown> | undefined;
  const fx = metadata.fx as Record<string, unknown> | undefined;
  const balances = metadata.balances as Record<string, unknown> | undefined;
  const pnl = metadata.pnl as Record<string, unknown> | undefined;
  const fxPolicy = fx?.fxPolicy as Record<string, unknown> | undefined;

  const extraKeys = Object.keys(metadata).filter(
    (k) => !["ownership", "fx", "balances", "pnl", "entityScope"].includes(k),
  );

  return (
    <div className="space-y-4">
      {ownership ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Ownership & NCI</h4>
          <KvMini
            items={[
              {
                label: "Parent share (weight)",
                value: formatScalarForDisplay(ownership.parentShareWeight),
              },
              {
                label: "NCI share",
                value: formatScalarForDisplay(ownership.nciShare),
              },
              {
                label: "NCI amount",
                value: formatScalarForDisplay(ownership.nciAmount),
              },
            ]}
          />
        </div>
      ) : null}

      {fx ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">FX & translation</h4>
          <KvMini
            items={[
              { label: "Group currency", value: String(fx.groupCurrency ?? "—") },
              { label: "FX date", value: String(fx.fxDate ?? "—") },
              {
                label: "Legacy rate policy",
                value: String(fx.legacyRatePolicy ?? fx.ratePolicy ?? "—"),
              },
              {
                label: "P&L rate",
                value: formatScalarForDisplay(fx.pnlFxRate),
              },
              {
                label: "Closing rate",
                value: formatScalarForDisplay(fx.closingFxRate),
              },
              {
                label: "Equity rate",
                value: formatScalarForDisplay(fx.equityFxRate),
              },
              {
                label: "Translated net income",
                value: formatScalarForDisplay(fx.translatedNetIncome),
              },
              {
                label: "CTA amount",
                value: formatScalarForDisplay(fx.ctaAmount),
              },
            ]}
          />
          {fxPolicy && typeof fxPolicy === "object" ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                FX policy (BS / P&L / Equity)
              </p>
              <KvMini
                items={[
                  { label: "Balance sheet", value: String(fxPolicy.bs ?? "—") },
                  { label: "P&L", value: String(fxPolicy.pnl ?? "—") },
                  { label: "Equity", value: String(fxPolicy.equity ?? "—") },
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {balances ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Intercompany balances</h4>
          <KvMini
            items={[
              {
                label: "Due from branches",
                value: formatScalarForDisplay(balances.grossDueFrom),
              },
              {
                label: "Due to branches",
                value: formatScalarForDisplay(balances.grossDueTo),
              },
              {
                label: "Residual (due from − due to)",
                value: formatScalarForDisplay(balances.residual),
              },
            ]}
          />
        </div>
      ) : null}

      {pnl ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Intercompany P&amp;L</h4>
          <KvMini
            items={[
              {
                label: "IC revenue",
                value: formatScalarForDisplay(pnl.interRev),
              },
              {
                label: "IC COGS",
                value: formatScalarForDisplay(pnl.interCogs),
              },
              {
                label: "IC expenses (net)",
                value: formatScalarForDisplay(pnl.interExp),
              },
              {
                label: "P&amp;L imbalance check",
                value: formatScalarForDisplay(pnl.pnlImbalance),
              },
            ]}
          />
        </div>
      ) : null}

      {extraKeys.length > 0 ? (
        <Collapsible className="group">
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            Other metadata ({extraKeys.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-md border bg-background/80 p-2">
              <NestedObjectFields
                obj={
                  Object.fromEntries(
                    extraKeys.map((k) => [k, metadata[k]]),
                  ) as Record<string, unknown>
                }
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function ExplainRollupPanel({
  explain,
}: {
  explain: Record<string, unknown> | null | undefined;
}) {
  const rollup = explain?.journalRollupByEliminationType as
    | Record<string, number>
    | undefined;
  const note = typeof explain?.note === "string" ? explain.note : null;
  const entries = rollup
    ? Object.entries(rollup).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-3">
      {note ? (
        <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
          {note}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No journal rollup by elimination type.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Elimination type</TableHead>
                <TableHead className="text-right">Abs. amount sum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([type, amt]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">{type}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(Number(amt) || 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EventPayloadPanel({
  payload,
}: {
  payload: Record<string, unknown> | null;
}) {
  if (!payload) {
    return <span className="text-muted-foreground">—</span>;
  }
  const summaryParts: string[] = [];
  if (payload.periodKey != null) summaryParts.push(`Period ${payload.periodKey}`);
  if (payload.nciAmount != null) {
    summaryParts.push(`NCI ${fmtAmount(Number(payload.nciAmount))}`);
  }
  if (payload.ctaAmount != null) {
    summaryParts.push(`CTA ${fmtAmount(Number(payload.ctaAmount))}`);
  }
  if (Array.isArray(payload.createdJournalIds)) {
    summaryParts.push(`${payload.createdJournalIds.length} journal(s)`);
  }
  if (payload.reason != null && typeof payload.reason === "string") {
    summaryParts.push(String(payload.reason));
  }

  return (
    <div className="max-w-lg space-y-2">
      {summaryParts.length > 0 ? (
        <p className="text-xs text-muted-foreground">{summaryParts.join(" · ")}</p>
      ) : null}
      <div className="rounded-md border bg-muted/15 p-2">
        <NestedObjectFields obj={payload} />
      </div>
    </div>
  );
}

export default function ConsolidationRunsPage() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "pharmacy1";
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [asOfDate, setAsOfDate] = React.useState(todayStr);
  const [fromDate, setFromDate] = React.useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = React.useState(todayStr);
  const [runs, setRuns] = React.useState<ConsolidationRunItem[]>([]);
  const [entities, setEntities] = React.useState<ConsolidationEntityItem[]>([]);
  const [entityId, setEntityId] = React.useState<string>("");
  const [groupCurrency, setGroupCurrency] = React.useState("USD");
  const [ratePolicy, setRatePolicy] = React.useState<
    "closing" | "average" | "historical"
  >("closing");
  const [includeAdjustments, setIncludeAdjustments] = React.useState(true);
  const [asDraft, setAsDraft] = React.useState(false);
  const [fxRateCount, setFxRateCount] = React.useState(0);
  const [adjustmentsCount, setAdjustmentsCount] = React.useState(0);
  const [selectedRun, setSelectedRun] = React.useState<
    (ConsolidationRunItem & {
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
    }) | null
  >(null);
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

  React.useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  React.useEffect(() => {
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
  }, [tenantSlug]);

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
      <Card>
        <CardHeader>
          <CardTitle>Consolidation runs</CardTitle>
          <CardDescription>
            Post and reverse elimination journals for a multi-branch period.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="as-of">As of</Label>
            <Input
              id="as-of"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from-date">From</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to-date">To</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-id">Entity (optional)</Label>
            <select
              id="entity-id"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Branch scope mode</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.code} — {entity.name} ({entity.branchCount} branches)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-currency">Group currency</Label>
            <Input
              id="group-currency"
              value={groupCurrency}
              onChange={(e) => setGroupCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-policy">Rate policy</Label>
            <select
              id="rate-policy"
              value={ratePolicy}
              onChange={(e) =>
                setRatePolicy(
                  e.target.value as "closing" | "average" | "historical",
                )
              }
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="closing">Closing</option>
              <option value="average">Average</option>
              <option value="historical">Historical</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAdjustments}
                onChange={(e) => setIncludeAdjustments(e.target.checked)}
              />
              Include approved adjustments
            </label>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={asDraft}
                onChange={(e) => setAsDraft(e.target.checked)}
              />
              Save as draft (no GL)
            </label>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={onRunConsolidation} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Run consolidation
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadRuns()}
              disabled={loading || submitting}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => void onQuickAdjustment()}
              disabled={submitting}
            >
              Quick adjustment
            </Button>
            <Button
              variant="secondary"
              onClick={() => void onDownloadAuditPackage()}
              disabled={submitting}
            >
              Audit package
            </Button>
          </div>
        </CardContent>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-4">
            <span>FX rates ({toDate}): {fxRateCount}</span>
            <span>Approved adjustments in scope: {adjustmentsCount}</span>
          </div>
        </CardContent>
      </Card>

      {err ? (
        <Alert variant="destructive">
          <AlertTitle>Consolidation error</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>
            Latest runs for this scope: status, period, dates, and branch count.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading runs…</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No consolidation runs found for this scope.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Branches</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Finalized</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{run.periodKey}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-normal">
                      {run.fromDate} → {run.toDate}
                      <span className="block text-[11px]">as of {run.asOfDate}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {run.scopeBranchIds?.length ?? 0}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fmtDateTime(run.postedAt)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {run.finalizedAt
                        ? fmtDateTime(run.finalizedAt)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void onSelectRun(run.id)}
                          disabled={submitting}
                        >
                          Detail
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void onFinalize(run.id)}
                          disabled={submitting || run.status !== "posted"}
                        >
                          Finalize
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void onReverse(run.id)}
                          disabled={
                            submitting ||
                            (run.status !== "posted" &&
                              run.status !== "finalized")
                          }
                        >
                          Reverse
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedRun ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Run detail</CardTitle>
                  <CardDescription
                    className="mt-1 font-mono text-xs"
                    title={selectedRun.id}
                  >
                    Run ID: {truncId(selectedRun.id, 10, 6)}
                  </CardDescription>
                </div>
                <Badge variant={statusBadgeVariant(selectedRun.status)} className="text-xs">
                  {selectedRun.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <KvMini
                items={[
                  { label: "Period", value: selectedRun.periodKey },
                  {
                    label: "Reporting window",
                    value: `${selectedRun.fromDate} → ${selectedRun.toDate}`,
                  },
                  { label: "As of date", value: selectedRun.asOfDate },
                  {
                    label: "Entity",
                    value: selectedRun.entityId
                      ? truncId(selectedRun.entityId, 10, 6)
                      : "Branch scope",
                  },
                  {
                    label: "Branches in scope",
                    value: String(selectedRun.scopeBranchIds?.length ?? 0),
                  },
                  {
                    label: "Scope hash",
                    value: (
                      <span className="break-all font-mono text-xs">
                        {truncId(selectedRun.scopeHash, 14, 6)}
                      </span>
                    ),
                  },
                  {
                    label: "Posted",
                    value: fmtDateTime(selectedRun.postedAt),
                  },
                  {
                    label: "Finalized",
                    value: selectedRun.finalizedAt
                      ? fmtDateTime(selectedRun.finalizedAt)
                      : "—",
                  },
                  {
                    label: "Finalized by",
                    value: selectedRun.finalizedBy
                      ? truncId(selectedRun.finalizedBy, 8, 4)
                      : "—",
                  },
                  {
                    label: "Reversed",
                    value: selectedRun.reversedAt
                      ? fmtDateTime(selectedRun.reversedAt)
                      : "—",
                  },
                  {
                    label: "Created by",
                    value: selectedRun.createdBy
                      ? truncId(selectedRun.createdBy, 8, 4)
                      : "—",
                  },
                  {
                    label: "Reversed by",
                    value: selectedRun.reversedBy
                      ? truncId(selectedRun.reversedBy, 8, 4)
                      : "—",
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stored metrics</CardTitle>
              <CardDescription>
                Values persisted with the run (ownership, FX, balances, P&amp;L).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunMetadataPanels metadata={selectedRun.metadata} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Journal links</CardTitle>
              <CardDescription>
                {selectedRun.journalLinks.length} elimination line link
                {selectedRun.journalLinks.length === 1 ? "" : "s"} to GL entries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRun.journalLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked journals (typical for draft runs).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Journal entry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.journalLinks.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell className="font-medium">
                          {link.eliminationType}
                        </TableCell>
                        <TableCell>{link.accountKey ?? "—"}</TableCell>
                        <TableCell>{link.direction ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtAmount(link.amount)}
                        </TableCell>
                        <TableCell
                          className="max-w-[140px] font-mono text-xs"
                          title={link.journalEntryId}
                        >
                          {truncId(link.journalEntryId, 8, 4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Explainability</CardTitle>
              <CardDescription>
                Roll-up of posted link amounts by elimination type (quick inspection).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExplainRollupPanel explain={selectedRun.explain} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Events</CardTitle>
              <CardDescription>
                {selectedRun.events.length} audit event
                {selectedRun.events.length === 1 ? "" : "s"} on this run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRun.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No events recorded for this run.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Time</TableHead>
                      <TableHead className="w-[140px]">Event</TableHead>
                      <TableHead className="w-[120px]">Actor</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.events.map((event) => (
                      <TableRow key={event.id} className="align-top">
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtDateTime(event.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {event.eventType}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs"
                          title={event.actorUserId ?? undefined}
                        >
                          {event.actorUserId
                            ? truncId(event.actorUserId, 6, 4)
                            : "system"}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {event.payload &&
                          typeof event.payload === "object" &&
                          !Array.isArray(event.payload) ? (
                            <EventPayloadPanel
                              payload={
                                event.payload as Record<string, unknown>
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Collapsible className="group rounded-lg border bg-muted/20 px-4 py-3">
            <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              Raw explain JSON (advanced)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
                {JSON.stringify(selectedRun.explain ?? {}, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}
