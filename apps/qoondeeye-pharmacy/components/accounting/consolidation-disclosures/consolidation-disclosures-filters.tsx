"use client";

import { Loader2 } from "lucide-react";

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

import type { DisclosureTab } from "./utils";

export function ConsolidationDisclosuresFilters({
  toDate,
  onToDateChange,
  periodKey,
  entities,
  entityId,
  onEntityIdChange,
  loading,
  onRefresh,
  tab,
  onTabChange,
  scopeHash,
}: {
  toDate: string;
  onToDateChange: (value: string) => void;
  periodKey: string;
  entities: ConsolidationEntityItem[];
  entityId: string;
  onEntityIdChange: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
  tab: DisclosureTab;
  onTabChange: (tab: DisclosureTab) => void;
  scopeHash: string;
}) {
  return (
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
              onChange={(e) => onToDateChange(e.target.value)}
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
              onChange={(e) => onEntityIdChange(e.target.value)}
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
          <Button variant="secondary" onClick={() => onRefresh()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant={tab === "nci" ? "default" : "outline"} onClick={() => onTabChange("nci")}>
            NCI
          </Button>
          <Button variant={tab === "fx" ? "default" : "outline"} onClick={() => onTabChange("fx")}>
            FX impact
          </Button>
          <Button variant={tab === "adj" ? "default" : "outline"} onClick={() => onTabChange("adj")}>
            Adjustments
          </Button>
          <Button variant={tab === "ic" ? "default" : "outline"} onClick={() => onTabChange("ic")}>
            IC elimination
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Scope: <span className="font-mono">{scopeHash}</span>
        </p>
      </CardContent>
    </Card>
  );
}
