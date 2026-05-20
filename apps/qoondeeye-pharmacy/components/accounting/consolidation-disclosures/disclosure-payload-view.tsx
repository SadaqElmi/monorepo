import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  AdjustmentLinesTable,
  BalancesPnlBlock,
  ExplainRollupTable,
  FxMetadataBlock,
  JournalLinksTable,
  OwnershipBlock,
  RunContextBanner,
} from "./disclosure-blocks";
import type { JournalLinkRow } from "./types";
import type { DisclosureTab } from "./utils";
import { truncId } from "./utils";

export function DisclosurePayloadView({
  tab,
  payload,
}: {
  tab: DisclosureTab;
  payload: Record<string, unknown> | null;
}) {
  if (!payload) {
    return (
      <p className="text-sm text-muted-foreground">No data loaded.</p>
    );
  }

  const message = typeof payload.message === "string" ? payload.message : null;
  if (
    message ||
    (tab !== "adj" && Array.isArray(payload.items) && payload.items.length === 0)
  ) {
    return (
      <Alert>
        <AlertTitle>No disclosure data</AlertTitle>
        <AlertDescription>
          {message ?? "Nothing to show for this scope."}
        </AlertDescription>
      </Alert>
    );
  }

  if (tab === "nci") {
    const nciLines = (Array.isArray(payload.nciLines)
      ? payload.nciLines
      : []) as JournalLinkRow[];
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
    const ctaLines = (Array.isArray(payload.ctaLines)
      ? payload.ctaLines
      : []) as JournalLinkRow[];
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
        <h4 className="text-sm font-semibold">
          Elimination journal links (BS / P&amp;L)
        </h4>
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
