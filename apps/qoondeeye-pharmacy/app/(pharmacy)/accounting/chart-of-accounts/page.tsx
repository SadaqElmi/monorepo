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
import { groupCoaByRoot, sortCoaTree } from "@/lib/accounting-display";
import { getChartOfAccounts, type ChartOfAccountRow } from "@/lib/api";

export default function AccountingChartOfAccountsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [coa, setCoa] = React.useState<ChartOfAccountRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void getChartOfAccounts(tenantSlug)
      .then((c) => {
        if (!cancelled) setCoa(c);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Failed to load chart of accounts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const coaGroups = React.useMemo(
    () => groupCoaByRoot(sortCoaTree(coa)),
    [coa],
  );

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Chart of accounts</CardTitle>
          <CardDescription>
            Default accounts are created per branch when the first journal is
            posted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Accordion
              key={coa.length > 0 ? "coa-loaded" : "coa-empty"}
              type="multiple"
              className="w-full"
              defaultValue={coaGroups.map((g) => g.id)}
            >
              {coaGroups.map((g) => (
                <AccordionItem key={g.id} value={g.id}>
                  <AccordionTrigger className="text-sm font-medium hover:no-underline">
                    <span className="text-left">{g.title}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({g.rows.length}{" "}
                      {g.rows.length === 1 ? "account" : "accounts"})
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Key</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.code ?? "—"}</TableCell>
                            <TableCell
                              className="max-w-[280px]"
                              style={{
                                paddingLeft: `calc(0.5rem + ${r.depth} * 0.75rem)`,
                              }}
                            >
                              {r.name}
                            </TableCell>
                            <TableCell>{r.account_type}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.account_key}
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
