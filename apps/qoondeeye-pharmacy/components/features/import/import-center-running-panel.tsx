"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_REPORT } from "@/lib/erp-query-options";
import {
  importJobDetailPath,
  IMPORT_TYPE_LABEL,
  IMPORT_STATUS_LABEL,
} from "@/lib/import-center";
import { listImportCenterRunning } from "@/lib/services/imports";

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ImportCenterRunningPanel() {
  const tenantSlug = getResolvedStoredUser()?.tenantSlug?.trim() ?? "";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: erpKeys.importCenterRunning(tenantSlug),
    queryFn: () => listImportCenterRunning(tenantSlug, 20),
    enabled: Boolean(tenantSlug),
    refetchInterval: 3000,
    staleTime: ERP_STALE_REPORT,
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Running imports</CardTitle>
        {isFetching && !isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports running.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.job.id}>
                  <TableCell className="font-mono text-xs">
                    {item.job.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell>
                    {IMPORT_TYPE_LABEL[
                      item.job.importType as keyof typeof IMPORT_TYPE_LABEL
                    ] ?? item.job.importType}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${item.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums">
                        {item.progressPercent}%
                      </span>
                    </div>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {IMPORT_STATUS_LABEL[item.job.status] ?? item.job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {item.rowsProcessed} / {item.rowsProcessed + item.rowsRemaining}
                    {item.rowsRemaining > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {item.rowsRemaining} remaining
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatShortDate(item.startedAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.estimatedCompletion
                      ? formatShortDate(item.estimatedCompletion)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const detailPath = importJobDetailPath(
                        item.job.importType,
                        item.job.id,
                      );
                      return detailPath ? (
                        <Link
                          href={detailPath}
                          className="text-sm text-primary hover:underline"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
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
