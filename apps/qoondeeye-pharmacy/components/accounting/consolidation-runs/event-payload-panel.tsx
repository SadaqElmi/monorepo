"use client";

import { NestedObjectFields } from "./nested-object-fields";
import { fmtAmount } from "./utils";

export function EventPayloadPanel({
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
