"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ConsolidationRunDetailSelected } from "./types";
import { fmtAmount, truncId } from "./utils";

export function JournalLinksCard({
  journalLinks,
}: {
  journalLinks: ConsolidationRunDetailSelected["journalLinks"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Journal links</CardTitle>
        <CardDescription>
          {journalLinks.length} elimination line link
          {journalLinks.length === 1 ? "" : "s"} to GL entries.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {journalLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked journals (typical for draft runs).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Journal entry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journalLinks.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">
                    {link.eliminationType}
                  </TableCell>
                  <TableCell>{link.accountKey ?? "—"}</TableCell>
                  <TableCell>{link.direction ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(link.amount)}
                  </TableCell>
                  <TableCell
                    className="max-w-[140px] font-mono text-xs"
                    title={link.journalEntryId}
                  >
                    {truncId(link.journalEntryId, 8, 4)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
