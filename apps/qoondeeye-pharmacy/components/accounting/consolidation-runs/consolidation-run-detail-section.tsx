"use client";

import { ExplainabilityCard } from "./explainability-card";
import { JournalLinksCard } from "./journal-links-card";
import { RawExplainJsonCollapsible } from "./raw-explain-json-collapsible";
import { RunDetailSummaryCard } from "./run-detail-summary-card";
import { RunEventsCard } from "./run-events-card";
import { RunStoredMetricsCard } from "./run-stored-metrics-card";
import type { ConsolidationRunDetailSelected } from "./types";

export function ConsolidationRunDetailSection({
  selectedRun,
}: {
  selectedRun: ConsolidationRunDetailSelected | null;
}) {
  if (!selectedRun) return null;

  return (
    <div className="space-y-4">
      <RunDetailSummaryCard selectedRun={selectedRun} />
      <RunStoredMetricsCard metadata={selectedRun.metadata} />
      <JournalLinksCard journalLinks={selectedRun.journalLinks} />
      <ExplainabilityCard explain={selectedRun.explain} />
      <RunEventsCard events={selectedRun.events} />
      <RawExplainJsonCollapsible explain={selectedRun.explain} />
    </div>
  );
}
