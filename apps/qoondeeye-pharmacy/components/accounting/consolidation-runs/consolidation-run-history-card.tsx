"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConsolidationRunItem } from "@/lib/services/accounting";

import { fmtDateTime, statusBadgeVariant } from "./utils";

export type ConsolidationRunHistoryCardProps = {
  runs: ConsolidationRunItem[];
  loading: boolean;
  submitting: boolean;
  onSelectRun: (runId: string) => void;
  onFinalize: (runId: string) => void;
  onReverse: (runId: string) => void;
};

export function ConsolidationRunHistoryCard({
  runs,
  loading,
  submitting,
  onSelectRun,
  onFinalize,
  onReverse,
}: ConsolidationRunHistoryCardProps) {
  return (
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
                    {run.finalizedAt ? fmtDateTime(run.finalizedAt) : "—"}
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
                          (run.status !== "posted" && run.status !== "finalized")
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
  );
}
