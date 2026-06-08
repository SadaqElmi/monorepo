"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  listImportHistory,
  type ImportJobListItem,
} from "@/lib/services/product-import";

const PAGE_SIZE = 25;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "secondary",
    validating: "secondary",
    preview: "default",
    confirmed: "default",
    committing: "secondary",
    completed: "default",
    failed: "destructive",
    reversed: "secondary",
  };
  return map[status] ?? "secondary";
}

function formatActor(
  user:
    | { name: string | null; email: string | null }
    | null
    | undefined,
): string {
  if (!user) return "—";
  return user.name?.trim() || user.email?.trim() || "—";
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function summaryLabel(job: ImportJobListItem): string {
  const s = job.summary;
  if (!s) return "—";
  const parts: string[] = [];
  if (s.createProducts) parts.push(`${s.createProducts} created`);
  if (s.updateProducts) parts.push(`${s.updateProducts} updated`);
  if (s.openingStockRows) parts.push(`${s.openingStockRows} opening stock`);
  return parts.length ? parts.join(", ") : "—";
}

export default function ImportHistoryClient() {
  const tenantSlug = useMemo(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
    [],
  );

  const [jobs, setJobs] = useState<ImportJobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const res = await listImportHistory(
        tenantSlug,
        "product",
        PAGE_SIZE,
        offset,
      );
      setJobs(res.jobs);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load import history");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <History className="size-6" />
            Import history
          </h1>
          <p className="text-muted-foreground text-sm">
            Who imported what, when — full audit trail per job.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/products/import">
              <ArrowLeft className="mr-2 size-4" />
              Back to import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/inventory/products/import">New import</Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All product imports</CardTitle>
          <CardDescription>
            {total} job{total === 1 ? "" : "s"} · click a file to see row-level
            detail and audit events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && jobs.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No imports yet.</p>
          ) : (
            <>
              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded by</TableHead>
                      <TableHead>Confirmed by</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Items summary</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Committed</TableHead>
                      <TableHead>Reversed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Link
                            href={`/inventory/products/import/${job.id}`}
                            className="text-primary font-medium underline-offset-4 hover:underline"
                          >
                            {job.fileName ?? job.id.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadge(job.status) as "default"}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatActor(job.createdByUser)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatActor(job.confirmedByUser)}
                        </TableCell>
                        <TableCell>{job.totalRows}</TableCell>
                        <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                          {summaryLabel(job)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatWhen(job.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatWhen(job.committedAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {job.reversedAt ? (
                            <span title={formatActor(job.reversedByUser)}>
                              {formatWhen(job.reversedAt)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
