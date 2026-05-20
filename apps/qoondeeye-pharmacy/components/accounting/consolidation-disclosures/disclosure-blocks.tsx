import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { JournalLinkRow } from "./types";
import { KvMini } from "./kv-mini";
import { fmtAmount, formatScalar, truncId } from "./utils";

export function JournalLinksTable({
  rows,
  emptyLabel,
}: {
  rows: JournalLinkRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
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

export function ExplainRollupTable({ explain }: { explain: unknown }) {
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

export function RunContextBanner({
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

export function OwnershipBlock({ ownership }: { ownership: unknown }) {
  if (!ownership || typeof ownership !== "object") {
    return (
      <p className="text-sm text-muted-foreground">
        No ownership snapshot on this run.
      </p>
    );
  }
  const o = ownership as Record<string, unknown>;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Ownership &amp; NCI</h4>
      <KvMini
        items={[
          {
            label: "Parent share (weight)",
            value: formatScalar(o.parentShareWeight),
          },
          { label: "NCI share", value: formatScalar(o.nciShare) },
          { label: "NCI amount", value: formatScalar(o.nciAmount) },
        ]}
      />
    </div>
  );
}

export function FxMetadataBlock({ fx }: { fx: unknown }) {
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
          {
            label: "Legacy rate policy",
            value: String(f.legacyRatePolicy ?? f.ratePolicy ?? "—"),
          },
          { label: "P&amp;L rate", value: formatScalar(f.pnlFxRate) },
          { label: "Closing rate", value: formatScalar(f.closingFxRate) },
          { label: "Equity rate", value: formatScalar(f.equityFxRate) },
          {
            label: "Translated net income",
            value: formatScalar(f.translatedNetIncome),
          },
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

export function BalancesPnlBlock({
  balances,
  pnl,
}: {
  balances: unknown;
  pnl: unknown;
}) {
  const hasB =
    balances &&
    typeof balances === "object" &&
    Object.keys(balances as object).length > 0;
  const hasP =
    pnl && typeof pnl === "object" && Object.keys(pnl as object).length > 0;
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
              {
                label: "P&amp;L imbalance check",
                value: formatScalar(p.pnlImbalance),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AdjustmentLinesTable({ lines }: { lines: unknown }) {
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
                <TableCell
                  key={c}
                  className="max-w-[200px] truncate font-mono text-xs"
                >
                  {typeof r[c] === "number"
                    ? fmtAmount(Number(r[c]))
                    : formatScalar(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
