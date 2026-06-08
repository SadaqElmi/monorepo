"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

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
import { getStoredUser } from "@/lib/auth-client";
import {
  listImportHistory,
  type ImportJobListItem,
  type ImportType,
} from "@/lib/services/imports";

export function ImportHistoryClient({
  importType,
  title,
  backHref,
  jobHrefPrefix,
}: {
  importType: ImportType;
  title: string;
  backHref: string;
  jobHrefPrefix?: string;
}) {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const prefix =
    jobHrefPrefix ??
    (importType === "product"
      ? "/inventory/products/import"
      : "/inventory/opening-stock/import");
  const [jobs, setJobs] = useState<ImportJobListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listImportHistory(tenantSlug, importType)
      .then((r) => setJobs(r.jobs))
      .finally(() => setLoading(false));
  }, [tenantSlug, importType]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>File</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="text-sm">
                  {new Date(j.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{j.status}</Badge>
                </TableCell>
                <TableCell>{j.totalRows}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">
                  {j.fileName}
                </TableCell>
                <TableCell>
                  <Button variant="link" size="sm" asChild>
                    <Link href={`${prefix}/${j.id}`}>Detail</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
