"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import {
  createFollowUpLevel,
  getFollowUpLevels,
} from "@/lib/services/accounting";

export default function ConfigurationFollowUpLevelsPage() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => getResolvedStoredUser()?.tenantSlug?.trim() ?? "",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [daysAfter, setDaysAfter] = React.useState("7");

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

  const levelsQuery = useQuery({
    queryKey: erpKeys.followUpLevels(tenantSlug, branchFacet, branchId ?? ""),
    queryFn: () => getFollowUpLevels(tenantSlug, branchId!),
    enabled: Boolean(tenantSlug && branchId),
    staleTime: ERP_STALE_STATIC,
  });
  const rows = levelsQuery.data ?? [];
  const loading = levelsQuery.isPending;
  const loadError = levelsQuery.error;
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load follow-up levels"
        : null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) {
      setError("Select a branch first.");
      return;
    }
    const d = Number(daysAfter);
    if (!name.trim() || !Number.isFinite(d) || d < 0) {
      setError("Enter a name and valid days after due.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createFollowUpLevel(tenantSlug, {
        branchId,
        name: name.trim(),
        daysAfterDue: d,
      });
      setName("");
      await queryClient.invalidateQueries({
        queryKey: ["erp", "follow-up-levels"],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create level");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
        </p>
      ) : null}
      {!branchId ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Select a branch to manage follow-up levels.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add follow-up level</CardTitle>
          <CardDescription>
            Collections reminder tiers (days after due date).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid max-w-md gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fu-name">Name</Label>
              <Input
                id="fu-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First reminder"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fu-days">Days after due</Label>
              <Input
                id="fu-days"
                type="number"
                min={0}
                value={daysAfter}
                onChange={(e) => setDaysAfter(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting || !branchId}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up levels</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !branchId ? null : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No levels yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Days after due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.days_after_due}
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
