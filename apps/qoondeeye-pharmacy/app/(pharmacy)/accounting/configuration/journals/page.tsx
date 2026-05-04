"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

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
import { getStoredUser } from "@/lib/auth-client";
import {
  getJournalBooks,
  type JournalBookRow,
} from "@/lib/services/accounting";

export default function ConfigurationJournalsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [books, setBooks] = React.useState<JournalBookRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const syncBranch = React.useCallback(() => {
    try {
      const v = localStorage.getItem("branchId");
      const t = v?.trim();
      setBranchId(t && t !== "all" ? t : null);
    } catch {
      setBranchId(null);
    }
  }, []);

  React.useEffect(() => {
    syncBranch();
    const onBranch = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { branchId?: string | null };
      if (detail?.branchId) setBranchId(detail.branchId);
      else syncBranch();
    };
    window.addEventListener("storage", () => syncBranch());
    window.addEventListener("activeBranchChanged", onBranch as EventListener);
    return () => {
      window.removeEventListener("activeBranchChanged", onBranch as EventListener);
    };
  }, [syncBranch]);

  const load = React.useCallback(async () => {
    if (!branchId) {
      setBooks([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const b = await getJournalBooks(tenantSlug, branchId);
      setBooks(b);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load journals");
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}
      {!branchId ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Select a branch to list journal books.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Journals</CardTitle>
          <CardDescription>
            Odoo-style journal books for this branch (sales, purchases, cash,
            miscellaneous). Created automatically when first accessed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !branchId ? null : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">{b.code}</TableCell>
                    <TableCell>{b.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {b.bookKind}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
