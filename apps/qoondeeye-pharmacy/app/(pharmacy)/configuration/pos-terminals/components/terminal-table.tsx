"use client";

import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Activity, Loader2, MoreHorizontal } from "lucide-react";
import { memo, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPosTerminalDate } from "@/lib/pos-terminals/format-date";
import { posTerminalActivityPath } from "@/lib/routes";
import type { PosTerminal } from "@/lib/services/pos-terminals";
import {
  TerminalBindingBadge,
  TerminalStatusBadge,
} from "./terminal-status-badge";

const VIRTUALIZE_THRESHOLD = 50;
const ROW_HEIGHT = 52;

type Props = {
  terminals: PosTerminal[];
  loading: boolean;
  canManage: boolean;
  hasFilters: boolean;
  onEdit: (terminal: PosTerminal) => void;
  onResetPassword: (terminal: PosTerminal) => void;
  onRevoke: (terminal: PosTerminal) => void;
  onDeactivate: (terminal: PosTerminal) => void;
  onReactivate: (terminal: PosTerminal) => void;
  deactivatingId?: string | null;
  onClearFilters?: () => void;
  onRetry?: () => void;
};

const TerminalRow = memo(function TerminalRow({
  terminal,
  canManage,
  onEdit,
  onResetPassword,
  onRevoke,
  onDeactivate,
  onReactivate,
  deactivatingId,
}: {
  terminal: PosTerminal;
  canManage: boolean;
  onEdit: (t: PosTerminal) => void;
  onResetPassword: (t: PosTerminal) => void;
  onRevoke: (t: PosTerminal) => void;
  onDeactivate: (t: PosTerminal) => void;
  onReactivate: (t: PosTerminal) => void;
  deactivatingId?: string | null;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          href={posTerminalActivityPath(terminal.id)}
          className="hover:underline"
        >
          {terminal.displayName ?? "Unnamed terminal"}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-sm">
        {terminal.terminalUsername ?? "—"}
      </TableCell>
      <TableCell>{terminal.branchName ?? "—"}</TableCell>
      <TableCell>
        <TerminalStatusBadge status={terminal.status} />
      </TableCell>
      <TableCell>
        <TerminalBindingBadge bindingStatus={terminal.bindingStatus} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatPosTerminalDate(terminal.lastSeenAt)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {terminal.createdByName ?? "—"}
      </TableCell>
      {canManage ? (
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={posTerminalActivityPath(terminal.id)}>
                  <Activity className="mr-2 h-4 w-4" />
                  View activity
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(terminal)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onResetPassword(terminal)}>
                Reset password
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRevoke(terminal)}>
                Revoke binding
              </DropdownMenuItem>
              {terminal.status === "active" ? (
                <DropdownMenuItem
                  disabled={deactivatingId === terminal.id}
                  onSelect={() => onDeactivate(terminal)}
                >
                  Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => onReactivate(terminal)}>
                  Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      ) : null}
    </TableRow>
  );
});

function SkeletonRows({ count, colSpan }: { count: number; colSpan: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={colSpan}>
            <Skeleton className="h-8 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function TerminalTable({
  terminals,
  loading,
  canManage,
  hasFilters,
  onEdit,
  onResetPassword,
  onRevoke,
  onDeactivate,
  onReactivate,
  deactivatingId,
  onClearFilters,
}: Props) {
  const colSpan = canManage ? 8 : 7;
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = terminals.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: terminals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  });

  const virtualRows = useVirtual ? virtualizer.getVirtualItems() : null;
  const rowsToRender = useVirtual
    ? (virtualRows ?? []).map((vr) => terminals[vr.index])
    : terminals;

  const tableBody = (
    <TableBody>
      {loading && terminals.length === 0 ? (
        <SkeletonRows count={5} colSpan={colSpan} />
      ) : terminals.length === 0 ? (
        <TableRow>
          <TableCell colSpan={colSpan} className="py-10 text-center">
            <p className="text-muted-foreground">
              {hasFilters
                ? "No terminals match your filters."
                : "No POS terminals found."}
            </p>
            {hasFilters && onClearFilters ? (
              <Button
                type="button"
                variant="link"
                className="mt-2"
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            ) : !hasFilters ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Add your first terminal to get started.
              </p>
            ) : null}
          </TableCell>
        </TableRow>
      ) : (
        rowsToRender.map((terminal) => (
          <TerminalRow
            key={terminal.id}
            terminal={terminal}
            canManage={canManage}
            onEdit={onEdit}
            onResetPassword={onResetPassword}
            onRevoke={onRevoke}
            onDeactivate={onDeactivate}
            onReactivate={onReactivate}
            deactivatingId={deactivatingId}
          />
        ))
      )}
    </TableBody>
  );

  return (
    <div className="rounded-xl border bg-card">
      <div
        ref={useVirtual ? parentRef : undefined}
        className={useVirtual ? "max-h-[min(70vh,640px)] overflow-auto" : undefined}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Terminal</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Binding</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Created by</TableHead>
              {canManage ? <TableHead className="w-[60px]" /> : null}
            </TableRow>
          </TableHeader>
          {tableBody}
        </Table>
      </div>
      {loading && terminals.length > 0 ? (
        <div className="flex items-center justify-center gap-2 border-t py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing…
        </div>
      ) : null}
    </div>
  );
}
