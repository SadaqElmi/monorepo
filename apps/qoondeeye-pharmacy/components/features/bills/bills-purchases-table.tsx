"use client";

import Link from "next/link";
import { Edit2, ExternalLink, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Branch, Purchase, Supplier } from "@/lib/api";

import { formatDate, formatMoney } from "./bills-format";

export type BillsPurchasesTableProps = {
  purchases: Purchase[];
  supplierMap: Map<string, Supplier>;
  branchMap: Map<string, Branch>;
  onEdit: (p: Purchase) => void;
  onRequestDelete: (p: Purchase) => void;
  deletingId: string | null;
};

export function BillsPurchasesTable({
  purchases,
  supplierMap,
  branchMap,
  onEdit,
  onRequestDelete,
  deletingId,
}: BillsPurchasesTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Supplier
            </TableHead>
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Branch
            </TableHead>
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Invoice #
            </TableHead>
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Total
            </TableHead>
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Purchase Date
            </TableHead>
            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
              Created At
            </TableHead>
            <TableHead className="w-24 text-right font-semibold uppercase tracking-wider text-primary">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.map((p) => {
            const supplierName =
              supplierMap.get(p.supplier_id ?? "")?.name ?? "—";
            const branchName = branchMap.get(p.branch_id ?? "")?.name ?? "—";

            return (
              <TableRow
                key={p.id}
                className="hover:bg-primary/5 transition-colors"
              >
                <TableCell className="text-sm">
                  <div className="min-w-[200px]">
                    <p className="font-semibold">{supplierName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {branchName}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.supplier_invoice_no ?? p.invoice_number ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {(p.status ?? "closed").replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-semibold">
                  {formatMoney(p.total_amount)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(p.purchase_date)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(p.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      asChild
                    >
                      <Link href={`/vendors/bills/${p.id}`}>
                        <ExternalLink className="h-4 w-4" />
                        <span className="sr-only">Open document</span>
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-primary hover:text-primary/80"
                      onClick={() => onEdit(p)}
                    >
                      <Edit2 className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-500/80"
                      onClick={() => onRequestDelete(p)}
                      disabled={deletingId === p.id}
                      title="Delete purchase (removes received stock from inventory)"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="sr-only">Delete</span>
                    </Button>
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
