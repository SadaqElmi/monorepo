"use client";

import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Edit2,
  FileEdit,
  Eye,
  ListChecks,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inventoryTransferDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

import type { StockTransferListRow } from "./types";
import { TransferStatusBadge } from "./transfer-status-badge";

function RowIcon({ status }: { status: StockTransferListRow["status"] }) {
  if (status === "confirmed") {
    return (
      <div className="flex size-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/40">
        <ListChecks className="size-3.5 text-violet-600 dark:text-violet-400" />
      </div>
    );
  }
  if (status === "shipped") {
    return (
      <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
        <ArrowUpRight className="size-3.5 text-blue-500" />
      </div>
    );
  }
  if (status === "received") {
    return (
      <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
        <ClipboardCheck className="size-3.5 text-emerald-500" />
      </div>
    );
  }
  if (status === "closed") {
    return (
      <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/70">
        <ClipboardCheck className="size-3.5 text-slate-600 dark:text-slate-200" />
      </div>
    );
  }
  return (
    <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
      <FileEdit className="size-3.5 text-muted-foreground" />
    </div>
  );
}

export function TransfersTable({
  rows,
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onEditClick,
  detailLinkReceiver = false,
  showEditAction = true,
}: {
  rows: StockTransferListRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onEditClick?: (row: StockTransferListRow) => void;
  /** Use `?receiver=1` for destination-branch workflow */
  detailLinkReceiver?: boolean;
  /** Hide edit for receiving-branch queues */
  showEditAction?: boolean;
}) {
  const showingStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm ring-1 ring-border/40">
      <Table>
        <TableHeader>
          <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
            <TableHead className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              Transfer ID
            </TableHead>
            <TableHead className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              From Branch
            </TableHead>
            <TableHead className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              To Branch
            </TableHead>
            <TableHead className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              Created By
            </TableHead>
            <TableHead className="px-6 py-4 text-right text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="group border-b transition-colors hover:bg-primary/5"
            >
              <TableCell className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <RowIcon status={row.status} />
                  <span className="font-bold">{row.displayId}</span>
                </div>
              </TableCell>
              <TableCell className="px-6 py-4 text-sm font-medium text-muted-foreground">
                {row.fromBranch}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm font-medium text-muted-foreground">
                {row.toBranch}
              </TableCell>
              <TableCell className="px-6 py-4">
                <TransferStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="px-6 py-4">
                <span className="text-sm font-semibold">{row.createdByName}</span>
              </TableCell>
              <TableCell className="px-6 py-4 text-right">
                <div
                  className={cn(
                    "flex items-center justify-end gap-1 transition-opacity",
                    "opacity-100 md:opacity-0 md:group-hover:opacity-100",
                  )}
                >
                  <Button variant="ghost" size="icon" className="size-9" asChild>
                    <Link
                      href={inventoryTransferDetailPath(row.id, {
                        receiver: detailLinkReceiver,
                      })}
                      aria-label="View transfer"
                    >
                      <Eye className="size-4" />
                    </Link>
                  </Button>
                  {showEditAction ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Edit transfer"
                      onClick={() => onEditClick?.(row)}
                      type="button"
                    >
                      <Edit2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-4">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium">
            {showingStart}-{showingEnd}
          </span>{" "}
          of <span className="font-medium">{totalCount}</span> transfers
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous</span>
          </Button>
          {(() => {
            const show = 3;
            let start = Math.max(1, page - Math.floor(show / 2));
            const end = Math.min(totalPages, start + show - 1);
            if (end - start + 1 < show) {
              start = Math.max(1, end - show + 1);
            }
            return Array.from(
              { length: Math.max(0, end - start + 1) },
              (_, i) => start + i,
            ).map((p) => (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 rounded-lg text-sm font-medium"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ));
          })()}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
