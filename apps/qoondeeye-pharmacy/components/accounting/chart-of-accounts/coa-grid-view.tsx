"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ChartAccountRow } from "@/lib/services/accounting";

type COAGridViewProps = {
  accounts: ChartAccountRow[];
  onAccountOpen: (account: ChartAccountRow) => void;
};

export function COAGridView({ accounts, onAccountOpen }: COAGridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {accounts.map((account) => (
        <Card
          key={account.id}
          tabIndex={0}
          role="button"
          className="cursor-pointer gap-0 rounded-lg border-slate-200 bg-white p-4 text-slate-950 transition-colors hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
          onClick={() => onAccountOpen(account)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onAccountOpen(account);
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Code
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-teal-700">
                {account.code ?? "-"}
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-slate-700"
            >
              {account.account_type}
            </Badge>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Account
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-950">
              {account.name}
            </p>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Account key
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-600">
              {account.account_key ?? "-"}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
