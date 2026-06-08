"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleDollarSign, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  getCustomer,
  getCustomerCreditSummary,
  getCustomerLoanHistory,
} from "@/lib/services/customers";
import { getCustomerPayments } from "@/lib/services/accounting";
import { getStoredUser } from "@/lib/auth-client";
import { POS_PAYMENT_METHOD_LABELS } from "@repo/types";

type CustomerDetailClientProps = {
  customerId: string;
};

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function paymentLabel(code: string | null | undefined) {
  if (!code) return "—";
  return POS_PAYMENT_METHOD_LABELS[code] ?? code;
}

export default function CustomerDetailClient({
  customerId,
}: CustomerDetailClientProps) {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const branchId = getStoredUser()?.assignedBranchId ?? undefined;

  const customerQuery = useQuery({
    queryKey: ["erp", "customers", tenantSlug, "detail", customerId],
    queryFn: () => getCustomer(tenantSlug, customerId),
    enabled: Boolean(tenantSlug && customerId),
  });

  const creditQuery = useQuery({
    queryKey: ["erp", "customers", tenantSlug, "credit", customerId],
    queryFn: () => getCustomerCreditSummary(tenantSlug, customerId),
    enabled: Boolean(tenantSlug && customerId),
  });

  const loansQuery = useQuery({
    queryKey: ["erp", "customers", tenantSlug, "loans", customerId],
    queryFn: () => getCustomerLoanHistory(tenantSlug, customerId),
    enabled: Boolean(tenantSlug && customerId),
  });

  const paymentsQuery = useQuery({
    queryKey: [
      "erp",
      "customer-payments",
      tenantSlug,
      branchId ?? "",
      customerId,
    ],
    queryFn: () =>
      branchId
        ? getCustomerPayments(tenantSlug, branchId, 100)
        : Promise.resolve([]),
    enabled: Boolean(tenantSlug && branchId),
    select: (rows) =>
      rows.filter(
        (r: { customerId?: string }) => r.customerId === customerId,
      ),
  });

  const customer = customerQuery.data;
  const credit = creditQuery.data;

  if (customerQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading customer…</div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/customers">Back to customers</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.name ?? "Customer"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {customer.phone ?? "No phone"}
            {customer.customer_no ? ` · #${customer.customer_no}` : ""}
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">
          {customer.credit_status ?? "active"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding balance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {money(credit?.outstandingBalance)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Credit limit
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {credit?.creditLimit != null ? money(credit.creditLimit) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Credit sales
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {credit?.creditSalesCount ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Repayments
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {money(credit?.repaymentsTotal)}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loans">Loan history</TabsTrigger>
          <TabsTrigger value="repayments">Repayments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleDollarSign className="h-4 w-4" />
                Credit profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Address</dt>
                  <dd>{customer.address ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Available credit
                  </dt>
                  <dd className="tabular-nums">
                    {credit?.availableCredit != null
                      ? money(credit.availableCredit)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Last payment
                  </dt>
                  <dd>
                    {credit?.lastPaymentDate?.slice(0, 10) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Status</dt>
                  <dd>{customer.is_active === false ? "Inactive" : "Active"}</dd>
                </div>
              </dl>
              <Button className="mt-4" variant="outline" asChild>
                <Link
                  href={`/customers/customer-payments?customerId=${customerId}`}
                >
                  Record repayment
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4" />
                On-account sales (AR)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(loansQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No credit sales yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (loansQuery.data ?? []).map((row) => (
                      <TableRow key={row.saleId}>
                        <TableCell>{row.receiptNumber ?? "—"}</TableCell>
                        <TableCell>{row.saleDate.slice(0, 10)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.originalAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.paidAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.remainingBalance)}
                        </TableCell>
                        <TableCell>{row.dueDate?.slice(0, 10) ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repayments" className="mt-4">
          <Card>
            <CardContent className="p-0 pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paymentsQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No repayments recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (paymentsQuery.data ?? []).map(
                      (p: {
                        id: string;
                        paymentDate: string;
                        paymentMethod: string | null;
                        amount: number;
                        reference: string | null;
                      }) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.paymentDate?.slice(0, 10)}</TableCell>
                          <TableCell>{paymentLabel(p.paymentMethod)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(p.amount)}
                          </TableCell>
                          <TableCell>{p.reference ?? "—"}</TableCell>
                        </TableRow>
                      ),
                    )
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
