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
import { getResolvedStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { getJournalEntries, type JournalEntryRow } from "@/lib/api";

const JOURNAL_LIMIT = 80;

export type JournalsPageClientProps = {
  initialJournals?: JournalEntryRow[] | null;
  serverPrefetched?: boolean;
};

export default function AccountingJournalsPage({
  initialJournals = null,
  serverPrefetched = false,
}: JournalsPageClientProps = {}) {
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => getResolvedStoredUser()?.tenantSlug?.trim() ?? "",
  );

  const journalsQuery = useQuery({
    queryKey: erpKeys.journalEntries(
      tenantSlug,
      branchFacet,
      undefined,
      JOURNAL_LIMIT,
    ),
    queryFn: () => getJournalEntries(tenantSlug, undefined, JOURNAL_LIMIT),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialJournals ? initialJournals : undefined,
  });
  const journals = journalsQuery.data ?? [];
  const loading = journalsQuery.isPending;
  const loadError = journalsQuery.error;
  const displayError =
    loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load journals"
        : null;

  return (
    <div className="space-y-4">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent journal entries</CardTitle>
          <CardDescription>
            Automated postings from sales, purchases, returns, and expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {journals.map((je) => (
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
                          · {je.source_type}
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
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
