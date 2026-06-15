"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCcw } from "lucide-react";

import { AdminCardTableLoading } from "@/components/admin/admin-loading";
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
import { getAdminAuditLogs } from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function AuditLogsClient() {
  const query = useQuery({
    queryKey: erpKeys.adminAuditLogs(),
    queryFn: () => getAdminAuditLogs(),
    staleTime: ERP_STALE_LIST,
  });

  const logs = query.data ?? [];

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Control-plane tenant actions, migration requests, backup requests,
            and POS binding changes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {query.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {query.error instanceof Error
            ? query.error.message
            : "Failed to load audit logs"}
        </p>
      ) : null}

      <Card className="ring-1 ring-foreground/10">
        <CardHeader className="border-b pb-4">
          <CardTitle>Recent events</CardTitle>
          <CardDescription>
            Safe Control DB audit records only. No tenant business data is
            displayed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {query.isLoading ? (
            <AdminCardTableLoading message="Loading audit logs..." rows={8} cols={6} />
          ) : logs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No admin audit events found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Action</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {log.action}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.tenantId ?? "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.adminUserId}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={log.result === "success" ? "success" : "destructive"}
                      >
                        {log.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {log.errorMessage ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
