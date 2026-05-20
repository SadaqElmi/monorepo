"use client";

import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { KvMini } from "./kv-mini";
import { NestedObjectFields } from "./nested-object-fields";
import { formatScalarForDisplay } from "./utils";

export function RunMetadataPanels({
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
