"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import {
  journalEntryAmount,
  journalEntryPartner,
  journalSourceLabel,
  money,
} from "@/lib/accounting-display";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import {
  getJournalEntries,
  type JournalEntryRow,
} from "@/lib/services/accounting";

export type RecentJournalEntriesCardProps = {
  tenantSlug?: string;
  branchId?: string;
  limit?: number;
  initialEntries?: JournalEntryRow[];
  serverPrefetched?: boolean;
  showViewAllLink?: boolean;
  className?: string;
};

export function RecentJournalEntriesCard({
  tenantSlug: tenantSlugProp,
  branchId,
  limit = 8,
  initialEntries = [],
  serverPrefetched = false,
  showViewAllLink = true,
  className,
}: RecentJournalEntriesCardProps) {
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => tenantSlugProp?.trim() || getResolvedStoredUser()?.tenantSlug?.trim() || "",
  );

  const entriesQuery = useQuery({
    queryKey: erpKeys.journalEntries(
      tenantSlug,
      branchFacet,
      branchId,
      limit,
    ),
    queryFn: () => getJournalEntries(tenantSlug, branchId, limit),
    enabled: Boolean(tenantSlug && branchId),
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialEntries ? initialEntries : undefined,
  });

  const entries = entriesQuery.data ?? [];
  const loading = entriesQuery.isPending && entries.length === 0;

  return (
    <Card
      className={`overflow-hidden rounded-2xl border-teal-500/10 shadow-sm ${className ?? ""}`}
    >
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4">
        <CardTitle className="text-sm font-bold uppercase tracking-widest">
          Recent journal entries
        </CardTitle>
        {showViewAllLink ? (
          <Button
            variant="link"
            className="h-auto p-0 text-xs font-bold text-teal-600"
            asChild
          >
            <Link href="/accounting/journals">View all</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {!branchId ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Select a branch in the header to load journal entries.
          </p>
        ) : loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : entriesQuery.error ? (
          <p className="px-4 py-8 text-center text-sm text-destructive">
            {entriesQuery.error instanceof Error
              ? entriesQuery.error.message
              : "Failed to load journal entries."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-[11px] uppercase tracking-wider hover:bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Journal</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No journal entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((row) => (
                  <TableRow key={row.id} className="hover:bg-teal-500/6">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.entry_date}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {journalSourceLabel(row.source_type)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs">
                      {row.description ?? row.source_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm">
                      {journalEntryPartner(row)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {money(journalEntryAmount(row))}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-[10px] font-bold uppercase tracking-widest text-emerald-800 hover:bg-emerald-100">
                        Posted
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
