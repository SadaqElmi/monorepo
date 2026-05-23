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
import { getStoredUser } from "@/lib/auth-client";
import { groupCoaByRoot, sortCoaTree } from "@/lib/accounting-display";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getChartOfAccounts, type ChartOfAccountRow } from "@/lib/api";

export type CustomersCoaPageClientProps = {
  initialCoa?: ChartOfAccountRow[] | null;
  serverPrefetched?: boolean;
};

export default function AccountingChartOfAccountsPage({
  initialCoa = null,
  serverPrefetched = false,
}: CustomersCoaPageClientProps = {}) {
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const coaQuery = useQuery({
    queryKey: erpKeys.chartOfAccounts(tenantSlug, branchFacet),
    queryFn: () => getChartOfAccounts(tenantSlug),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    initialData: serverPrefetched && initialCoa ? initialCoa : undefined,
  });
  const coa = coaQuery.data ?? [];
  const loading = coaQuery.isPending;
  const loadError = coaQuery.error;
  const displayError =
    loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load chart of accounts"
        : null;

  const coaGroups = React.useMemo(
    () => groupCoaByRoot(sortCoaTree(coa)),
    [coa],
  );

  return (
    <div className="space-y-4">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
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
