"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConsolidationEntityItem } from "@/lib/services/accounting";

export type ConsolidationRunsFormCardProps = {
  asOfDate: string;
  onAsOfDateChange: (value: string) => void;
  fromDate: string;
  onFromDateChange: (value: string) => void;
  toDate: string;
  onToDateChange: (value: string) => void;
  entityId: string;
  onEntityIdChange: (value: string) => void;
  entities: ConsolidationEntityItem[];
  groupCurrency: string;
  onGroupCurrencyChange: (value: string) => void;
  ratePolicy: "closing" | "average" | "historical";
  onRatePolicyChange: (value: "closing" | "average" | "historical") => void;
  includeAdjustments: boolean;
  onIncludeAdjustmentsChange: (checked: boolean) => void;
  asDraft: boolean;
  onAsDraftChange: (checked: boolean) => void;
  onRunConsolidation: () => void;
  onRefresh: () => void;
  onQuickAdjustment: () => void;
  onDownloadAuditPackage: () => void;
  submitting: boolean;
  loading: boolean;
  fxRateCount: number;
  adjustmentsCount: number;
};

export function ConsolidationRunsFormCard({
  asOfDate,
  onAsOfDateChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  entityId,
  onEntityIdChange,
  entities,
  groupCurrency,
  onGroupCurrencyChange,
  ratePolicy,
  onRatePolicyChange,
  includeAdjustments,
  onIncludeAdjustmentsChange,
  asDraft,
  onAsDraftChange,
  onRunConsolidation,
  onRefresh,
  onQuickAdjustment,
  onDownloadAuditPackage,
  submitting,
  loading,
  fxRateCount,
  adjustmentsCount,
}: ConsolidationRunsFormCardProps) {
  return (
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
            onChange={(e) => onAsOfDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="from-date">From</Label>
          <Input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to-date">To</Label>
          <Input
            id="to-date"
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entity-id">Entity (optional)</Label>
          <select
            id="entity-id"
            value={entityId}
            onChange={(e) => onEntityIdChange(e.target.value)}
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
            onChange={(e) => onGroupCurrencyChange(e.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rate-policy">Rate policy</Label>
          <select
            id="rate-policy"
            value={ratePolicy}
            onChange={(e) =>
              onRatePolicyChange(
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
              onChange={(e) => onIncludeAdjustmentsChange(e.target.checked)}
            />
            Include approved adjustments
          </label>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asDraft}
              onChange={(e) => onAsDraftChange(e.target.checked)}
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
            onClick={onRefresh}
            disabled={loading || submitting}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={onQuickAdjustment}
            disabled={submitting}
          >
            Quick adjustment
          </Button>
          <Button
            variant="secondary"
            onClick={onDownloadAuditPackage}
            disabled={submitting}
          >
            Audit package
          </Button>
        </div>
      </CardContent>
      <CardContent className="pt-0 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-4">
          <span>
            FX rates ({toDate}): {fxRateCount}
          </span>
          <span>Approved adjustments in scope: {adjustmentsCount}</span>
        </div>
      </CardContent>
    </Card>
  );
}
