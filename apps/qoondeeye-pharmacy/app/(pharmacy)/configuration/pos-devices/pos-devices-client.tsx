"use client";

import Link from "next/link";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpPosDevices } from "@/hooks/queries/use-erp-pos-devices";
import { posTerminalActivityPath } from "@/lib/routes";
import { getResolvedStoredUser } from "@/lib/auth-client";
import {
  disablePosDevice,
  enablePosDevice,
  forceLogoutPosDevice,
  wipePosDeviceCredential,
} from "@/lib/services/pos-devices";
import { useQueryClient } from "@tanstack/react-query";

function isOnline(lastHeartbeatAt: string | null): boolean {
  if (!lastHeartbeatAt) return false;
  return Date.now() - new Date(lastHeartbeatAt).getTime() < 5 * 60 * 1000;
}

export function PosDevicesClient() {
  const tenantSlug = getResolvedStoredUser()?.tenantSlug ?? "";
  const query = useErpPosDevices({ limit: 100 });
  const qc = useQueryClient();

  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["erp", "pos-devices"] });

  const error = query.error instanceof Error ? query.error.message : null;

  return (
    <ConfigurationModuleShell
      title="POS Devices"
      description="Fleet inventory: hardware metadata, heartbeat, and remote actions."
      stat={{
        icon: MonitorSmartphone,
        value: `${query.data?.length ?? 0} devices`,
      }}
    >
      {error ? <ConfigurationErrorBanner message={error} /> : null}

      {query.isPending ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>OS / Browser</TableHead>
                <TableHead>Last IP</TableHead>
                <TableHead>Heartbeat</TableHead>
                <TableHead>Sync queue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No devices have reported a heartbeat yet. Devices appear
                    after POS terminals are used.
                  </TableCell>
                </TableRow>
              ) : (
                (query.data ?? []).map((d) => {
                  const online = !d.disabled && isOnline(d.lastHeartbeatAt);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">
                          {d.deviceName ?? d.displayName ?? d.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {d.deviceModel ?? "—"}
                        </div>
                        <Link
                          href={posTerminalActivityPath(d.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          View terminal
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.osVersion ?? "—"}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {d.browserVersion ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>{d.lastIp ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {d.lastHeartbeatAt
                          ? new Date(d.lastHeartbeatAt).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {d.pendingOutboxCount > 0 ? (
                          <Badge variant="secondary">
                            {d.pendingOutboxCount} pending
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={online ? "default" : "secondary"}>
                            {online ? "Online" : "Offline"}
                          </Badge>
                          {d.disabled ? (
                            <Badge variant="destructive">Disabled</Badge>
                          ) : null}
                          <Badge variant="outline">{d.bindingStatus}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {d.disabled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void enablePosDevice(tenantSlug, d.id).then(
                                refresh,
                              )
                            }
                          >
                            Enable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void disablePosDevice(tenantSlug, d.id).then(
                                refresh,
                              )
                            }
                          >
                            Disable
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void forceLogoutPosDevice(tenantSlug, d.id).then(
                              refresh,
                            )
                          }
                        >
                          Force logout
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Wipe device credential? Terminal must be set up again.",
                              )
                            ) {
                              return;
                            }
                            void wipePosDeviceCredential(tenantSlug, d.id).then(
                              refresh,
                            );
                          }}
                        >
                          Wipe
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </ConfigurationModuleShell>
  );
}
