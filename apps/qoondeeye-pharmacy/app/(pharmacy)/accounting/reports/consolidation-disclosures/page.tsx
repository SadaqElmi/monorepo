"use client";

import * as React from "react";
import { format } from "date-fns";
import { ChevronDown, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
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

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function periodFromDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return format(new Date(), "yyyy-MM");
  return format(d, "yyyy-MM");
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

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return fmtAmount(value);
  if (typeof value === "string") return value || "—";
  return String(value);
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
          <dd className="text-sm font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type JournalLinkRow = {
  id: string;
  journalEntryId: string;
  eliminationType: string;
  accountKey: string | null;
  direction: string | null;
  amount: number;
};

function JournalLinksTable({
  rows,
  emptyLabel,
}: {
  rows: JournalLinkRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Direction</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Journal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((link) => (
          <TableRow key={link.id}>
            <TableCell className="font-medium">{link.eliminationType}</TableCell>
            <TableCell>{link.accountKey ?? "—"}</TableCell>
            <TableCell>{link.direction ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmtAmount(Number(link.amount) || 0)}
            </TableCell>
            <TableCell className="font-mono text-xs" title={link.journalEntryId}>
              {truncId(link.journalEntryId, 8, 4)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExplainRollupTable({ explain }: { explain: unknown }) {
  const rollup =
    explain &&
    typeof explain === "object" &&
    explain !== null &&
    "journalRollupByEliminationType" in explain
      ? (explain as { journalRollupByEliminationType?: Record<string, number> })
          .journalRollupByEliminationType
      : undefined;
  const note =
    explain &&
    typeof explain === "object" &&
    explain !== null &&
    "note" in explain &&
    typeof (explain as { note?: unknown }).note === "string"
      ? (explain as { note: string }).note
      : null;
  const entries = rollup
    ? Object.entries(rollup).sort(([a], [b]) => a.localeCompare(b))
    : [];
  if (!note && entries.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      {note ? (
        <p className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      {entries.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Elimination type (rollup)</TableHead>
              <TableHead className="text-right">Abs. sum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([type, amt]) => (
              <TableRow key={type}>
                <TableCell>{type}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtAmount(Number(amt) || 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

function RunContextBanner({
  runId,
  status,
  periodKey,
}: {
  runId?: string;
  status?: string;
  periodKey?: string;
}) {
  if (!runId && !periodKey) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">Source run</p>
        <p className="font-mono text-sm" title={runId}>
          {runId ? truncId(runId, 12, 6) : "—"}
        </p>
      </div>
      {periodKey ? (
        <div>
          <p className="text-xs text-muted-foreground">Period</p>
          <p className="text-sm font-semibold">{periodKey}</p>
        </div>
      ) : null}
      {status ? (
        <Badge variant={status === "finalized" ? "success" : "outline"}>
          {status}
        </Badge>
      ) : null}
    </div>
  );
}

function OwnershipBlock({ ownership }: { ownership: unknown }) {
  if (!ownership || typeof ownership !== "object") {
    return (
      <p className="text-sm text-muted-foreground">No ownership snapshot on this run.</p>
    );
  }
  const o = ownership as Record<string, unknown>;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Ownership &amp; NCI</h4>
      <KvMini
        items={[
          { label: "Parent share (weight)", value: formatScalar(o.parentShareWeight) },
          { label: "NCI share", value: formatScalar(o.nciShare) },
          { label: "NCI amount", value: formatScalar(o.nciAmount) },
        ]}
      />
    </div>
  );
}

function FxMetadataBlock({ fx }: { fx: unknown }) {
  if (!fx || typeof fx !== "object") {
    return (
      <p className="text-sm text-muted-foreground">No FX metadata on this run.</p>
    );
  }
  const f = fx as Record<string, unknown>;
  const policy = f.fxPolicy as Record<string, unknown> | undefined;
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">FX &amp; CTA</h4>
      <KvMini
        items={[
          { label: "Group currency", value: String(f.groupCurrency ?? "—") },
          { label: "FX date", value: String(f.fxDate ?? "—") },
          { label: "Legacy rate policy", value: String(f.legacyRatePolicy ?? f.ratePolicy ?? "—") },
          { label: "P&amp;L rate", value: formatScalar(f.pnlFxRate) },
          { label: "Closing rate", value: formatScalar(f.closingFxRate) },
          { label: "Equity rate", value: formatScalar(f.equityFxRate) },
          { label: "Translated net income", value: formatScalar(f.translatedNetIncome) },
          { label: "CTA amount", value: formatScalar(f.ctaAmount) },
        ]}
      />
      {policy && typeof policy === "object" ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            FX policy (BS / P&amp;L / Equity)
          </p>
          <KvMini
            items={[
              { label: "Balance sheet", value: String(policy.bs ?? "—") },
              { label: "P&amp;L", value: String(policy.pnl ?? "—") },
              { label: "Equity", value: String(policy.equity ?? "—") },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function BalancesPnlBlock({
  balances,
  pnl,
}: {
  balances: unknown;
  pnl: unknown;
}) {
  const hasB =
    balances && typeof balances === "object" && Object.keys(balances as object).length > 0;
  const hasP = pnl && typeof pnl === "object" && Object.keys(pnl as object).length > 0;
  if (!hasB && !hasP) {
    return (
      <p className="text-sm text-muted-foreground">
        No intercompany balance / P&amp;L snapshot on this run.
      </p>
    );
  }
  const b = (hasB ? balances : {}) as Record<string, unknown>;
  const p = (hasP ? pnl : {}) as Record<string, unknown>;
  return (
    <div className="space-y-4">
      {hasB ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Intercompany balances</h4>
          <KvMini
            items={[
              { label: "Due from branches", value: formatScalar(b.grossDueFrom) },
              { label: "Due to branches", value: formatScalar(b.grossDueTo) },
              { label: "Residual", value: formatScalar(b.residual) },
            ]}
          />
        </div>
      ) : null}
      {hasP ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Intercompany P&amp;L</h4>
          <KvMini
            items={[
              { label: "IC revenue", value: formatScalar(p.interRev) },
              { label: "IC COGS", value: formatScalar(p.interCogs) },
              { label: "IC expenses (net)", value: formatScalar(p.interExp) },
              { label: "P&amp;L imbalance check", value: formatScalar(p.pnlImbalance) },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function AdjustmentLinesTable({ lines }: { lines: unknown }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return <span className="text-muted-foreground">No lines</span>;
  }
  const rows = lines.filter((x) => x && typeof x === "object") as Record<
    string,
    unknown
  >[];
  const keys = new Set<string>();
  for (const r of rows) {
    Object.keys(r).forEach((k) => keys.add(k));
  }
  const cols = [...keys];
  if (cols.length === 0) {
    return <span className="text-muted-foreground">Empty line payload</span>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c} className="capitalize">
                {c.replace(/_/g, " ")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {cols.map((c) => (
                <TableCell key={c} className="max-w-[200px] truncate font-mono text-xs">
                  {typeof r[c] === "number" ? fmtAmount(Number(r[c])) : formatScalar(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DisclosurePayloadView({
  tab,
  payload,
}: {
  tab: "nci" | "fx" | "adj" | "ic";
  payload: Record<string, unknown> | null;
}) {
  if (!payload) {
    return (
      <p className="text-sm text-muted-foreground">No data loaded.</p>
    );
  }

  const message = typeof payload.message === "string" ? payload.message : null;
  if (message || (tab !== "adj" && Array.isArray(payload.items) && payload.items.length === 0)) {
    return (
      <Alert>
        <AlertTitle>No disclosure data</AlertTitle>
        <AlertDescription>{message ?? "Nothing to show for this scope."}</AlertDescription>
      </Alert>
    );
  }

  if (tab === "nci") {
    const nciLines = (Array.isArray(payload.nciLines) ? payload.nciLines : []) as JournalLinkRow[];
    return (
      <div className="space-y-6">
        <RunContextBanner
          runId={String(payload.runId ?? "")}
          status={String(payload.status ?? "")}
          periodKey={String(payload.periodKey ?? "")}
        />
        <OwnershipBlock ownership={payload.ownership} />
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">NCI journal links</h4>
          <JournalLinksTable
            rows={nciLines}
            emptyLabel="No NCI elimination lines on this run."
          />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Explainability rollup</h4>
          <ExplainRollupTable explain={payload.explain} />
        </div>
      </div>
    );
  }

  if (tab === "fx") {
    const ctaLines = (Array.isArray(payload.ctaLines) ? payload.ctaLines : []) as JournalLinkRow[];
    return (
      <div className="space-y-6">
        <RunContextBanner runId={String(payload.runId ?? "")} />
        <FxMetadataBlock fx={payload.fx} />
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">CTA / translation journal links</h4>
          <JournalLinksTable
            rows={ctaLines}
            emptyLabel="No CTA translation lines on this run."
          />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Explainability rollup</h4>
          <ExplainRollupTable explain={payload.explain} />
        </div>
      </div>
    );
  }

  if (tab === "adj") {
    const items = (Array.isArray(payload.items) ? payload.items : []) as Array<{
      id: string;
      title: string;
      status: string;
      lines: unknown;
      appliedRunId: string | null;
    }>;
    if (items.length === 0) {
      return (
        <Alert>
          <AlertTitle>No adjustments</AlertTitle>
          <AlertDescription>
            No consolidation adjustments match this scope and period.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {items.length} adjustment{items.length === 1 ? "" : "s"} (newest first).
        </p>
        <div className="space-y-6">
          {items.map((adj) => (
            <Card key={adj.id} className="border-dashed">
              <CardHeader className="py-3 pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{adj.title}</CardTitle>
                  <Badge variant="outline">{adj.status}</Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  ID {truncId(adj.id, 10, 6)}
                  {adj.appliedRunId ? (
                    <span className="ml-2">
                      · Applied run{" "}
                      <span title={adj.appliedRunId}>
                        {truncId(adj.appliedRunId, 8, 4)}
                      </span>
                    </span>
                  ) : (
                    <span className="ml-2">· Not applied to a run</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <AdjustmentLinesTable lines={adj.lines} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  /* ic */
  const eliminationLines = (
    Array.isArray(payload.eliminationLines) ? payload.eliminationLines : []
  ) as JournalLinkRow[];
  return (
    <div className="space-y-6">
      <RunContextBanner runId={String(payload.runId ?? "")} />
      <BalancesPnlBlock balances={payload.balances} pnl={payload.pnl} />
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Elimination journal links (BS / P&amp;L)</h4>
        <JournalLinksTable
          rows={eliminationLines}
          emptyLabel="No balance sheet or P&amp;L elimination lines on this run."
        />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Explainability rollup</h4>
        <ExplainRollupTable explain={payload.explain} />
      </div>
    </div>
  );
}

export default function ConsolidationDisclosuresPage() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "pharmacy1";
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [toDate, setToDate] = React.useState(todayStr);
  const [entities, setEntities] = React.useState<ConsolidationEntityItem[]>([]);
  const [entityId, setEntityId] = React.useState("");
  const [tab, setTab] = React.useState<"nci" | "fx" | "adj" | "ic">("nci");
  const [payload, setPayload] = React.useState<Record<string, unknown> | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const baseScopeHash = React.useMemo(
    () => `agg:${aggregateAll ? 1 : 0}|branch:${branchId ?? "none"}`,
    [aggregateAll, branchId],
  );
  const scopeHash = entityId ? `scope:entity:${entityId}` : baseScopeHash;
  const periodKey = periodFromDate(toDate);

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

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    setPayload(null);
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
    }
  }, [entityId, periodKey, scopeHash, tab, tenantSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const tabTitle =
    tab === "nci"
      ? "Non-controlling interest (NCI)"
      : tab === "fx"
        ? "FX impact & CTA"
        : tab === "adj"
          ? "Consolidation adjustments"
          : "Intercompany elimination";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Consolidation disclosures</CardTitle>
          <CardDescription>
            Reader-oriented consolidation outputs. Requires permission{" "}
            <code className="text-xs">view_disclosure_reports</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-end">Period end</Label>
              <Input
                id="period-end"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Period key: <span className="font-medium">{periodKey}</span>
              </p>
            </div>
            <div className="min-w-[220px] flex-1 space-y-2">
              <Label htmlFor="entity-scope">Entity (optional)</Label>
              <select
                id="entity-scope"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Branch scope (report branch selector)</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.code} — {entity.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant={tab === "nci" ? "default" : "outline"} onClick={() => setTab("nci")}>
              NCI
            </Button>
            <Button variant={tab === "fx" ? "default" : "outline"} onClick={() => setTab("fx")}>
              FX impact
            </Button>
            <Button variant={tab === "adj" ? "default" : "outline"} onClick={() => setTab("adj")}>
              Adjustments
            </Button>
            <Button variant={tab === "ic" ? "default" : "outline"} onClick={() => setTab("ic")}>
              IC elimination
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Scope: <span className="font-mono">{scopeHash}</span>
          </p>
        </CardContent>
      </Card>

      {err ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tabTitle}</CardTitle>
          <CardDescription>
            Structured view for the selected tab. Use raw JSON only if you need the exact API
            payload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <DisclosurePayloadView tab={tab} payload={payload} />
          )}
          {!loading && payload ? (
            <Collapsible className="group rounded-lg border bg-muted/15 px-3 py-2">
              <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                Raw API payload (advanced)
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className="max-h-[50vh] overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
