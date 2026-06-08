"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChartAccountRow } from "@/lib/services/accounting";

type COATableViewProps = {
  accounts: ChartAccountRow[];
  canManage: boolean;
  pendingAccountId?: string | null;
  onAccountOpen: (account: ChartAccountRow) => void;
  onActiveChange: (account: ChartAccountRow, active: boolean) => void;
  onReconciliationChange: (
    account: ChartAccountRow,
    allowReconciliation: boolean,
  ) => void;
};

export function COATableView({
  accounts,
  canManage,
  pendingAccountId = null,
  onAccountOpen,
  onActiveChange,
  onReconciliationChange,
}: COATableViewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow className="border-slate-200 hover:bg-slate-50">
            <TableHead className="px-4 text-slate-600">Code</TableHead>
            <TableHead className="px-4 text-slate-600">Account Name</TableHead>
            <TableHead className="px-4 text-slate-600">Type</TableHead>
            <TableHead className="px-4 text-slate-600">Account Key</TableHead>
            <TableHead className="px-4 text-center text-slate-600">
              Active
            </TableHead>
            <TableHead className="px-4 text-center text-slate-600">
              Allow Reconciliation
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => {
            const pending = pendingAccountId === account.id;

            return (
              <TableRow
                key={account.id}
                tabIndex={0}
                className="cursor-pointer border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                onClick={() => onAccountOpen(account)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onAccountOpen(account);
                  }
                }}
              >
                <TableCell className="px-4 font-mono text-sm text-teal-700">
                  {account.code ?? "-"}
                </TableCell>
                <TableCell className="min-w-[260px] max-w-[460px] whitespace-normal px-4">
                  <button
                    type="button"
                    className="text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-700 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAccountOpen(account);
                    }}
                  >
                    {account.name}
                  </button>
                </TableCell>
                <TableCell className="px-4">
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {account.account_type}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 font-mono text-xs text-slate-600">
                  {account.account_key ?? "-"}
                </TableCell>
                <TableCell className="px-4 text-center">
                  <div
                    className="inline-flex items-center justify-center"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <Switch
                        checked={Boolean(account.active)}
                        disabled={!canManage}
                        className="data-checked:bg-teal-600 data-unchecked:bg-slate-300"
                        onCheckedChange={(checked) =>
                          onActiveChange(account, checked)
                        }
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 text-center">
                  <div
                    className="inline-flex items-center justify-center"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <Switch
                        checked={Boolean(account.allow_reconciliation)}
                        disabled={!canManage}
                        className="data-checked:bg-teal-600 data-unchecked:bg-slate-300"
                        onCheckedChange={(checked) =>
                          onReconciliationChange(account, checked)
                        }
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
