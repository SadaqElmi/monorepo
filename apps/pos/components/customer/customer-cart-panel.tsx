"use client";

import * as React from "react";
import { Eye, User, UserMinus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CustomerCreditSummary, CustomerSummary } from "@repo/types";
import { formatMoney } from "@/shared/lib";

type CustomerCartPanelProps = {
  customer: CustomerSummary | null;
  creditSummary: CustomerCreditSummary | null;
  creditLoading?: boolean;
  onSelectCustomer: () => void;
  onChangeCustomer: () => void;
  onClearCustomer: () => void;
};

export function CustomerCartPanel({
  customer,
  creditSummary,
  creditLoading,
  onSelectCustomer,
  onChangeCustomer,
  onClearCustomer,
}: CustomerCartPanelProps) {
  const [infoOpen, setInfoOpen] = React.useState(false);

  if (!customer) {
    return (
      <div className="mb-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-900/40">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={onSelectCustomer}
        >
          <UserPlus className="h-4 w-4" />
          Select Customer
        </Button>
      </div>
    );
  }

  const outstanding = creditSummary?.outstandingBalance ?? 0;
  const creditLimit = creditSummary?.creditLimit;
  const available = creditSummary?.availableCredit;

  return (
    <>
      <div className="mb-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
              <User className="mr-1 inline h-3.5 w-3.5" />
              {customer.name?.trim() || "Customer"}
            </p>
            {customer.phone ? (
              <p className="text-xs text-muted-foreground">{customer.phone}</p>
            ) : null}
            {creditLoading ? (
              <p className="text-xs text-muted-foreground">Loading credit…</p>
            ) : creditSummary ? (
              <div className="space-y-0.5 pt-1 text-xs">
                <p>
                  Outstanding:{" "}
                  <span className="font-medium tabular-nums">
                    {formatMoney(outstanding)}
                  </span>
                </p>
                {creditLimit != null ? (
                  <p>
                    Credit limit:{" "}
                    <span className="font-medium tabular-nums">
                      {formatMoney(creditLimit)}
                    </span>
                  </p>
                ) : null}
                {available != null ? (
                  <p>
                    Available credit:{" "}
                    <span className="font-medium tabular-nums">
                      {formatMoney(available)}
                    </span>
                  </p>
                ) : null}
                {creditSummary.creditStatus !== "active" ? (
                  <p className="font-medium text-amber-700">
                    Status: {creditSummary.creditStatus}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onChangeCustomer}
          >
            Change
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onClearCustomer}
          >
            <UserMinus className="mr-1 h-3 w-3" />
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setInfoOpen(true)}
            disabled={!creditSummary}
          >
            <Eye className="mr-1 h-3 w-3" />
            Info
          </Button>
        </div>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customer credit summary</DialogTitle>
          </DialogHeader>
          {creditSummary ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="font-medium">{creditSummary.customerName}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{creditSummary.phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd className="tabular-nums">
                {formatMoney(creditSummary.outstandingBalance)}
              </dd>
              <dt className="text-muted-foreground">Credit limit</dt>
              <dd className="tabular-nums">
                {creditSummary.creditLimit != null
                  ? formatMoney(creditSummary.creditLimit)
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Available</dt>
              <dd className="tabular-nums">
                {creditSummary.availableCredit != null
                  ? formatMoney(creditSummary.availableCredit)
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Credit sales</dt>
              <dd>{creditSummary.creditSalesCount}</dd>
              <dt className="text-muted-foreground">Repayments</dt>
              <dd className="tabular-nums">
                {formatMoney(creditSummary.repaymentsTotal)}
              </dd>
              <dt className="text-muted-foreground">Last payment</dt>
              <dd>{creditSummary.lastPaymentDate?.slice(0, 10) ?? "—"}</dd>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
