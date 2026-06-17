"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Loader2,
  Monitor,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Wifi,
  WifiOff,
} from "lucide-react";

import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { PosOpsQuickLinks } from "@/components/pos/pos-ops-quick-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useErpPosMonitoringEvents,
  useErpPosMonitoringOverview,
} from "@/hooks/queries/use-erp-pos-monitoring";
import { useErpPosApprovals } from "@/hooks/queries/use-erp-pos-approvals";
import { ROUTES, auditTrailPath } from "@/lib/routes";

export function PosCenterClient() {
  const overview = useErpPosMonitoringOverview();
  const events = useErpPosMonitoringEvents(30);
  const approvals = useErpPosApprovals(50);
  const data = overview.data;

  const pendingApprovals = approvals.data?.length ?? 0;
  const fleetPendingOutbox =
    data?.devices.reduce((sum, d) => sum + (d.pendingOutbox ?? 0), 0) ?? 0;

  const error = overview.error instanceof Error ? overview.error.message : null;

  return (
    <ConfigurationModuleShell
      title="POS Operations Center"
      description="Live terminal health, shifts, sales, and POS audit activity."
      stat={{
        icon: Monitor,
        value: data
          ? `${data.terminals.online} online · ${data.activeShifts} shifts`
          : "Loading…",
      }}
      headerEnd={
        <Button
          variant="outline"
          size="sm"
          disabled={overview.isFetching}
          onClick={() => void overview.refetch()}
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${overview.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <PosOpsQuickLinks />

        {error ? <ConfigurationErrorBanner message={error} /> : null}

        {overview.isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {(pendingApprovals > 0 || fleetPendingOutbox > 0) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                {pendingApprovals > 0 ? (
                  <Link
                    href={ROUTES.configuration.posApprovals}
                    className="font-medium text-amber-950 underline-offset-2 hover:underline"
                  >
                    {pendingApprovals} supervisor approval
                    {pendingApprovals === 1 ? "" : "s"} pending
                  </Link>
                ) : null}
                {fleetPendingOutbox > 0 ? (
                  <span className="text-amber-900">
                    {fleetPendingOutbox} offline sale(s) queued across terminals
                  </span>
                ) : null}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Online"
                value={data ? String(data.terminals.online) : "—"}
                icon={Wifi}
              />
              <StatCard
                title="Offline"
                value={data ? String(data.terminals.offline) : "—"}
                icon={WifiOff}
              />
              <StatCard
                title="Active shifts"
                value={data ? String(data.activeShifts) : "—"}
                icon={Activity}
              />
              <StatCard
                title="Sales today"
                value={data ? data.salesTodayTotal.toFixed(2) : "—"}
                icon={ShoppingCart}
              />
              <StatCard
                title="Refunds today"
                value={data ? String(data.refundsToday) : "—"}
                icon={RotateCcw}
              />
              <StatCard
                title="Variance alerts"
                value={data ? String(data.varianceAlerts) : "—"}
                icon={AlertTriangle}
              />
              <StatCard
                title="Pending approvals"
                value={approvals.isPending ? "—" : String(pendingApprovals)}
                icon={ShieldCheck}
              />
              <StatCard
                title="Offline sync queue"
                value={data ? String(fleetPendingOutbox) : "—"}
                icon={WifiOff}
              />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Monitor className="size-4" />
                  Terminal fleet
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href={ROUTES.configuration.posDevices}>
                    Manage devices
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data?.devices ?? []).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {d.name ?? d.id.slice(0, 8)}
                      </span>
                      <Badge variant={d.online ? "default" : "secondary"}>
                        {d.online ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground">
                      {d.pendingOutbox > 0
                        ? `${d.pendingOutbox} pending sync`
                        : d.lastHeartbeatAt
                          ? new Date(d.lastHeartbeatAt).toLocaleTimeString()
                          : "No heartbeat"}
                    </span>
                  </div>
                ))}
                {!data?.devices?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No terminals registered yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent POS events</CardTitle>
                <div className="flex gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={ROUTES.configuration.posAudit}>
                      POS audit log
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={auditTrailPath({ table: "pos_auth" })}>
                      Branch audit
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(events.data ?? []).map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{e.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
                {!events.data?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No recent POS events.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ConfigurationModuleShell>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
