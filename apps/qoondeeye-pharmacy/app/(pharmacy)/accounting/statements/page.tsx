"use client";

import * as React from "react";
import { format, startOfMonth } from "date-fns";
import { Loader2 } from "lucide-react";

import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import {
  getBalanceSheet,
  getIncomeStatement,
  type BalanceSheetResult,
  type IncomeStatementResult,
} from "@/lib/api";

export default function AccountingStatementsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [income, setIncome] = React.useState<IncomeStatementResult | null>(
    null,
  );
  const [balance, setBalance] = React.useState<BalanceSheetResult | null>(
    null,
  );
  const [loadingStmt, setLoadingStmt] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const now = new Date();
  const [isFrom, setIsFrom] = React.useState(
    format(startOfMonth(now), "yyyy-MM-dd"),
  );
  const [isTo, setIsTo] = React.useState(format(now, "yyyy-MM-dd"));
  const [bsDate, setBsDate] = React.useState(format(now, "yyyy-MM-dd"));

  const loadStatements = React.useCallback(async () => {
    setLoadingStmt(true);
    setErr(null);
    try {
      const [inc, bal] = await Promise.all([
        getIncomeStatement(tenantSlug, isFrom, isTo),
        getBalanceSheet(tenantSlug, bsDate),
      ]);
      setIncome(inc);
      setBalance(bal);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoadingStmt(false);
    }
  }, [tenantSlug, isFrom, isTo, bsDate]);

  React.useEffect(() => {
    void loadStatements();
  }, [loadStatements]);

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Income statement &amp; balance sheet</CardTitle>
            <CardDescription>
              Data comes from posted journal entries (sales, purchases, returns,
              expenses).
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingStmt}
            onClick={() => void loadStatements()}
          >
            {loadingStmt ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label htmlFor="is-from">P&amp;L from</Label>
              <Input
                id="is-from"
                type="date"
                value={isFrom}
                onChange={(e) => setIsFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="is-to">P&amp;L to</Label>
              <Input
                id="is-to"
                type="date"
                value={isTo}
                onChange={(e) => setIsTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bs-asof">Balance sheet as of</Label>
              <Input
                id="bs-asof"
                type="date"
                value={bsDate}
                onChange={(e) => setBsDate(e.target.value)}
              />
            </div>
          </div>

          <Accordion
            key={`${!!income}-${!!balance}`}
            type="multiple"
            defaultValue={[
              ...(income ? ["income-statement"] : []),
              ...(balance ? ["balance-sheet"] : []),
            ]}
            className="w-full"
          >
            {income ? (
              <AccordionItem value="income-statement">
                <AccordionTrigger className="text-base font-semibold hover:no-underline">
                  Income statement
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mb-3 flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border/80 pb-3">
                      <span>
                        Revenue:{" "}
                        <strong>{money(income.totalRevenue)}</strong>
                      </span>
                      <span>
                        Cost of goods sold:{" "}
                        <strong>{money(income.cogs)}</strong>
                      </span>
                      <span>
                        Gross profit:{" "}
                        <strong>{money(income.grossProfit)}</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <span>
                        Other expenses:{" "}
                        <strong>{money(income.otherExpenses)}</strong>
                      </span>
                      <span>
                        Total expenses:{" "}
                        <strong>{money(income.totalExpenses)}</strong>
                      </span>
                      <span>
                        Net income:{" "}
                        <strong>{money(income.netIncome)}</strong>
                      </span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {income.lines.map((ln) => (
                        <TableRow key={`${ln.accountKey}-${ln.name}`}>
                          <TableCell>{ln.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {ln.accountType}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(ln.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ) : null}

            {balance ? (
              <AccordionItem value="balance-sheet">
                <AccordionTrigger className="text-base font-semibold hover:no-underline">
                  Balance sheet
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mb-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span>
                      Assets:{" "}
                      <strong className="text-foreground">
                        {money(balance.totals.assets)}
                      </strong>
                    </span>
                    <span>
                      Liabilities:{" "}
                      <strong className="text-foreground">
                        {money(balance.totals.liabilities)}
                      </strong>
                    </span>
                    <span>
                      Equity (incl. implicit P&amp;L):{" "}
                      <strong className="text-foreground">
                        {money(balance.totals.totalEquity)}
                      </strong>
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balance.lines.map((ln) => (
                        <TableRow key={`${ln.accountKey}-${ln.name}`}>
                          <TableCell>{ln.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {ln.accountType}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(ln.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ) : null}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
