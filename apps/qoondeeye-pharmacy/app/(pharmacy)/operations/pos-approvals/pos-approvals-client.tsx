"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { PosOpsQuickLinks } from "@/components/pos/pos-ops-quick-links";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpPosApprovals } from "@/hooks/queries/use-erp-pos-approvals";

export default function PosApprovalsClient() {
  const { data, isLoading, error } = useErpPosApprovals(50);

  return (
    <ConfigurationModuleShell
      title="POS Approvals"
      description="Supervisor requests awaiting action — large discounts, refunds, voids, and shift variance."
      stat={{
        icon: ShieldCheck,
        value: isLoading ? "Loading…" : `${data?.length ?? 0} pending`,
      }}
      headerEnd={<PosOpsQuickLinks />}
    >
      {error ? (
        <ConfigurationErrorBanner
          message={error instanceof Error ? error.message : "Failed to load approvals"}
        />
      ) : null}

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No pending approvals. Offline sales needing supervisor sign-off
                    are approved on the POS terminal when back online.
                  </TableCell>
                </TableRow>
              ) : (
                (data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.actionType}</TableCell>
                    <TableCell>{row.reasonNote ?? row.reasonCode ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.expiresAt
                        ? new Date(row.expiresAt).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </ConfigurationModuleShell>
  );
}
