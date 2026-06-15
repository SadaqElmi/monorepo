"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";

import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { PosOpsQuickLinks } from "@/components/pos/pos-ops-quick-links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStoredUser } from "@/lib/auth-client";
import {
  getSalesByBranch,
  getSalesByCashier,
  getSalesByHour,
  getTopProducts,
} from "@/lib/services/pos-analytics";

export function PosAnalyticsClient() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const range = { from: from || undefined, to: to || undefined };

  const byBranch = useQuery({
    queryKey: ["erp", "pos-analytics", "branch", tenantSlug, from, to],
    enabled: Boolean(tenantSlug),
    queryFn: () => getSalesByBranch(tenantSlug, range.from, range.to),
  });
  const byCashier = useQuery({
    queryKey: ["erp", "pos-analytics", "cashier", tenantSlug, from, to],
    enabled: Boolean(tenantSlug),
    queryFn: () => getSalesByCashier(tenantSlug, range.from, range.to),
  });
  const byHour = useQuery({
    queryKey: ["erp", "pos-analytics", "hour", tenantSlug, from, to],
    enabled: Boolean(tenantSlug),
    queryFn: () => getSalesByHour(tenantSlug, range.from, range.to),
  });
  const topProducts = useQuery({
    queryKey: ["erp", "pos-analytics", "products", tenantSlug, from, to],
    enabled: Boolean(tenantSlug),
    queryFn: () => getTopProducts(tenantSlug, range.from, range.to),
  });

  const loading =
    byBranch.isPending ||
    byCashier.isPending ||
    byHour.isPending ||
    topProducts.isPending;
  const error =
    byBranch.error instanceof Error
      ? byBranch.error.message
      : byCashier.error instanceof Error
        ? byCashier.error.message
        : null;

  return (
    <ConfigurationModuleShell
      title="POS Analytics"
      description="Multi-store retail performance by branch, cashier, hour, and product."
      stat={{ icon: BarChart3, value: "Retail performance" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <PosOpsQuickLinks />

        {error ? <ConfigurationErrorBanner message={error} /> : null}

        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-from">From</Label>
            <Input
              id="analytics-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-to">To</Label>
            <Input
              id="analytics-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[180px]"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <AnalyticsList title="Sales by branch" rows={byBranch.data ?? []} />
            <AnalyticsList title="Sales by cashier" rows={byCashier.data ?? []} />
            <AnalyticsList
              title="Sales by hour"
              rows={(byHour.data ?? []).map((r) => ({
                label: `${r.hour}:00`,
                total: r.total,
                count: r.count,
              }))}
            />
            <AnalyticsList
              title="Top products"
              rows={(topProducts.data ?? []).map((r) => ({
                label: r.label,
                total: r.total,
                count: r.quantity,
              }))}
            />
          </div>
        )}
      </div>
    </ConfigurationModuleShell>
  );
}

function AnalyticsList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label?: string; total: number; count?: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.slice(0, 10).map((r, i) => (
          <div
            key={`${r.label ?? i}`}
            className="flex items-center justify-between text-sm"
          >
            <span className="truncate pr-2">{r.label ?? "—"}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {r.total.toFixed(2)}
              {r.count != null ? ` (${r.count})` : ""}
            </span>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
