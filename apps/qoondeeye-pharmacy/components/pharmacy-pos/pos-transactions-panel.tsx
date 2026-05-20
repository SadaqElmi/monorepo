"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PosTransaction } from "@/components/pos/pos-transaction-receipt";

import { formatMoney } from "./pharmacy-pos-utils";

type PosTransactionsPanelProps = {
  transactions: PosTransaction[];
  onOpenTransaction: (tx: PosTransaction) => void;
};

export function PosTransactionsPanel({
  transactions,
  onOpenTransaction,
}: PosTransactionsPanelProps) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-[color:var(--pos-brand)]/10 dark:bg-slate-900/40">
      <CardHeader className="shrink-0 border-b border-[color:var(--pos-brand)]/10 py-4">
        <CardTitle className="text-base font-bold">Past receipts</CardTitle>
        <p className="text-sm text-muted-foreground">
          With a tenant account, receipt numbers come from the server. This list
          is also kept in the browser until you clear site data.
        </p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto py-4">
        {transactions.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No receipts yet. Complete a sale on Register — we save it and open the
            print dialog.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transactions.map((tx) => (
              <li key={`${tx.saleId ?? tx.receiptId}-${tx.createdAt}`}>
                <button
                  type="button"
                  onClick={() => {
                    void onOpenTransaction(tx);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--pos-brand)]/15 bg-[color:var(--pos-brand)]/[0.04] px-4 py-3 text-left transition-colors hover:bg-[color:var(--pos-brand)]/10"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-[color:var(--pos-brand)]">
                      {tx.receiptId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleString()} ·{" "}
                      {tx.paymentMethod}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatMoney(tx.total)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
