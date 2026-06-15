"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useMemo } from "react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useErpPosTerminalActivity } from "@/hooks/queries/use-erp-pos-terminal-activity";
import { getStoredUser } from "@/lib/auth-client";
import { formatPosTerminalDate } from "@/lib/pos-terminals/format-date";
import { bindingBadgeVariant } from "@/lib/pos-terminals/terminal-status";
import { ROUTES } from "@/lib/routes";

const ACTIVITY_PAGE_SIZE = 20;

export function PosTerminalActivityClient({
  terminalId,
}: {
  terminalId: string;
}) {
  const storedUser = useMemo(() => getStoredUser(), []);
  const tenantSlug = storedUser?.tenantSlug ?? "";
  const [page, setPage] = React.useState(1);

  const activityQuery = useErpPosTerminalActivity(tenantSlug, terminalId, {
    page,
    limit: ACTIVITY_PAGE_SIZE,
  });

  const data = activityQuery.data;
  const terminal = data?.terminal;
  const error =
    activityQuery.error instanceof Error
      ? activityQuery.error.message
      : activityQuery.error
        ? "Failed to load terminal activity."
        : null;

  const sessionsTotal = data?.recentSessions.total ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(sessionsTotal / ACTIVITY_PAGE_SIZE),
  );

  return (
    <ConfigurationModuleShell
      title={terminal?.displayName ?? "POS Terminal"}
      description="Terminal activity, sessions, and security audit trail."
      headerEnd={
        <div className="flex items-center gap-3">
          <Link
            href={ROUTES.configuration.posAudit}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            POS audit log
          </Link>
          <Link
            href={ROUTES.configuration.posTerminals}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to terminals
          </Link>
        </div>
      }
    >
      {error ? <ConfigurationErrorBanner message={error} /> : null}

      {activityQuery.isPending ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : terminal ? (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Status" value={terminal.status} />
            <Stat
              label="Binding"
              value={
                <Badge variant={bindingBadgeVariant(terminal.bindingStatus)}>
                  {terminal.bindingStatus}
                </Badge>
              }
            />
            <Stat
              label="Last seen"
              value={formatPosTerminalDate(terminal.lastSeenAt)}
            />
            <Stat
              label="Last setup attempt"
              value={formatPosTerminalDate(terminal.lastSetupAttemptAt)}
            />
            <Stat label="Branch" value={terminal.branchName ?? "—"} />
            <Stat label="Username" value={terminal.terminalUsername ?? "—"} />
            <Stat label="Created by" value={terminal.createdByName ?? "—"} />
            <Stat
              label="Device fingerprint"
              value={terminal.deviceFingerprint ?? "—"}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Sales (24h)"
              value={String(data?.stats.salesLast24h ?? 0)}
            />
            <Stat
              label="Login failures (24h)"
              value={String(data?.stats.loginFailuresLast24h ?? 0)}
            />
            <Stat
              label="Current cashier"
              value={
                data?.currentSession?.staffName ??
                (data?.currentSession ? "Signed in" : "No open session")
              }
            />
          </section>

          <Tabs defaultValue="sessions" className="w-full">
            <TabsList>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="audit">Audit trail</TabsTrigger>
              <TabsTrigger value="failures">Login failures</TabsTrigger>
            </TabsList>
            <TabsContent value="sessions" className="mt-4 space-y-4">
              <ActivityTable
                headers={["Opened", "Closed", "Status", "Cashier"]}
                rows={(data?.recentSessions.items ?? []).map((s) => [
                  formatPosTerminalDate(s.openedAt),
                  formatPosTerminalDate(s.closedAt),
                  s.status,
                  s.staffName ?? "—",
                ])}
                empty="No sessions for this terminal."
              />
            </TabsContent>
            <TabsContent value="audit" className="mt-4 space-y-4">
              <ActivityTable
                headers={["Time", "Action", "Actor"]}
                rows={(data?.recentAudit.items ?? []).map((a) => [
                  formatPosTerminalDate(a.createdAt),
                  a.action,
                  a.actorName ?? "—",
                ])}
                empty="No audit events."
              />
            </TabsContent>
            <TabsContent value="failures" className="mt-4 space-y-4">
              <ActivityTable
                headers={["Time", "Details"]}
                rows={(data?.recentLoginFailures.items ?? []).map((f) => [
                  formatPosTerminalDate(f.createdAt),
                  f.payload?.outcome ? String(f.payload.outcome) : "—",
                ])}
                empty="No recent login failures."
              />
            </TabsContent>
          </Tabs>

          {sessionsTotal > ACTIVITY_PAGE_SIZE ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} ({sessionsTotal} sessions)
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || activityQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || activityQuery.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </ConfigurationModuleShell>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function ActivityTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={headers.length}
                className="py-8 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j}>{cell}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
