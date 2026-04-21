"use client";

import * as React from "react";
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
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import { getJournalEntries, type JournalEntryRow } from "@/lib/api";

export default function AccountingJournalsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [journals, setJournals] = React.useState<JournalEntryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void getJournalEntries(tenantSlug, undefined, 80)
      .then((j) => {
        if (!cancelled) setJournals(j);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Failed to load journals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
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
