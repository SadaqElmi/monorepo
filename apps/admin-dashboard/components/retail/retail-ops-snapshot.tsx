"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Loader2,
  ShieldAlert,
  Store,
  Wifi,
  WifiOff,
} from "lucide-react";

import { erpKeys } from "@/lib/erp-query-keys";
import { getRetailOpsOverview } from "@/lib/services/retail-ops";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function RetailOpsSnapshot() {
  const { data, isLoading, error } = useQuery({
    queryKey: [...erpKeys.adminRetailOps(), "snapshot"],
    queryFn: () => getRetailOpsOverview(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const offlineDevices =
    data?.tenants.reduce((sum, t) => sum + t.offlineDevices, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="size-4" />
            Retail operations
          </CardTitle>
          <CardDescription>
            Cross-tenant POS fleet health, audit activity, and offline sync backlog.
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1">
          <Link href="/retail-ops">
            Details
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load retail ops"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SnapshotMetric label="Tenants" value={data?.tenantCount ?? 0} />
            <SnapshotMetric
              label="Devices reporting"
              value={data?.devicesReporting ?? 0}
              icon={Wifi}
            />
            <SnapshotMetric
              label="Offline devices"
              value={offlineDevices}
              icon={WifiOff}
              alert={offlineDevices > 0}
            />
            <SnapshotMetric
              label="Pending outbox"
              value={data?.pendingOutboxTotal ?? 0}
              alert={(data?.pendingOutboxTotal ?? 0) > 0}
            />
            <SnapshotMetric
              label="Failed logins (24h)"
              value={data?.failedLogins24h ?? 0}
              icon={ShieldAlert}
              alert={(data?.failedLogins24h ?? 0) > 0}
            />
            <SnapshotMetric
              label="Audit events (24h)"
              value={data?.controlAuditEvents24h ?? 0}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotMetric({
  label,
  value,
  icon: Icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon?: ComponentType<{ className?: string }>;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${alert ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/20"}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
