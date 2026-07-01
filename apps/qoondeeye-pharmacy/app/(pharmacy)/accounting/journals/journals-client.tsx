"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { journalSourceLabel, money } from "@/lib/accounting-display";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { getJournalEntries, type JournalEntryRow } from "@/lib/services/accounting";

const JOURNAL_LIMIT = 80;

export type JournalsPageClientProps = {
  tenantSlug?: string;
  serverScope?: { branchId?: string };
  initialJournals?: JournalEntryRow[] | null;
  serverPrefetched?: boolean;
};

export default function AccountingJournalsPage({
  tenantSlug: tenantSlugProp,
  serverScope,
  initialJournals = null,
  serverPrefetched = false,
}: JournalsPageClientProps = {}) {
  const branchFacet = useErpBranchFacet();
  const { branchId: hookBranchId } = useReportBranchQuery();
  const effectiveBranchId = hookBranchId ?? serverScope?.branchId;

  const [tenantSlug] = React.useState(
    () =>
      tenantSlugProp?.trim() ||
      getResolvedStoredUser()?.tenantSlug?.trim() ||
      "",
  );

  const journalsQuery = useQuery({
    queryKey: erpKeys.journalEntries(
      tenantSlug,
      branchFacet,
      effectiveBranchId,
      JOURNAL_LIMIT,
    ),
    queryFn: () =>
      getJournalEntries(tenantSlug, effectiveBranchId, JOURNAL_LIMIT),
    enabled: Boolean(tenantSlug && effectiveBranchId),
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialJournals ? initialJournals : undefined,
  });

  const journals = journalsQuery.data ?? [];
  const loading = journalsQuery.isPending && journals.length === 0;
  const loadError = journalsQuery.error;
  const displayError =
    loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load journals"
        : null;

  return (
    <div className="space-y-4 px-4 pb-8 md:px-8">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
        </p>
      ) : null}

      {!effectiveBranchId ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Select a branch in the header to load journal entries.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent journal entries</CardTitle>
          <CardDescription>
            Latest {JOURNAL_LIMIT} automated postings from sales, purchases,
            returns, and expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {journals.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No journal entries yet.
                </p>
              ) : (
                journals.map((je) => (
                  <AccordionItem
                    key={je.id}
                    value={je.id}
                    className="rounded-lg border border-border/80 px-3 last:border-b"
                  >
                    <AccordionTrigger className="py-3 text-sm hover:no-underline">
                      <div className="flex flex-1 flex-col items-start gap-0.5 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="font-medium">
                          {je.entry_date}
                          <span className="ml-2 font-normal text-muted-foreground">
                            · {journalSourceLabel(je.source_type)}
                          </span>
                        </span>
                        <span className="max-w-full truncate text-muted-foreground sm:max-w-[50%]">
                          {je.description ?? "—"}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {je.lines.map((ln) => (
                            <TableRow key={ln.id}>
                              <TableCell>{ln.account_name}</TableCell>
                              <TableCell className="text-right">
                                {Number(ln.debit) > 0
                                  ? money(Number(ln.debit))
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {Number(ln.credit) > 0
                                  ? money(Number(ln.credit))
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                ))
              )}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
