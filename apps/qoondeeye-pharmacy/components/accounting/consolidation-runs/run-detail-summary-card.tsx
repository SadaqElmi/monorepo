"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { KvMini } from "./kv-mini";
import type { ConsolidationRunDetailSelected } from "./types";
import { fmtDateTime, statusBadgeVariant, truncId } from "./utils";

export function RunDetailSummaryCard({
  selectedRun,
}: {
  selectedRun: ConsolidationRunDetailSelected;
}) {
  return (
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
  );
}
