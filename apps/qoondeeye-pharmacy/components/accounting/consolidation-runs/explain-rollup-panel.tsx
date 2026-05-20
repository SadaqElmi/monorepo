"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { fmtAmount } from "./utils";

export function ExplainRollupPanel({
  explain,
}: {
  explain: Record<string, unknown> | null | undefined;
}) {
  const rollup = explain?.journalRollupByEliminationType as
    | Record<string, number>
    | undefined;
  const note = typeof explain?.note === "string" ? explain.note : null;
  const entries = rollup
    ? Object.entries(rollup).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-3">
      {note ? (
        <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
          {note}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No journal rollup by elimination type.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Elimination type</TableHead>
                <TableHead className="text-right">Abs. amount sum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([type, amt]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">{type}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(Number(amt) || 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
