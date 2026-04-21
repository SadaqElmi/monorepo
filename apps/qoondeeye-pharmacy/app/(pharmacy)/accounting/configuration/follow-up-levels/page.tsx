"use client";

import * as React from "react";
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
import { getStoredUser } from "@/lib/auth-client";
import {
  createFollowUpLevel,
  getFollowUpLevels,
  type FollowUpLevelRow,
} from "@/lib/services/accounting";

export default function ConfigurationFollowUpLevelsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<FollowUpLevelRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
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

  const load = React.useCallback(async () => {
    if (!branchId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await getFollowUpLevels(tenantSlug, branchId);
      setRows(list);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load follow-up levels");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) {
      setErr("Select a branch first.");
      return;
    }
    const d = Number(daysAfter);
    if (!name.trim() || !Number.isFinite(d) || d < 0) {
      setErr("Enter a name and valid days after due.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await createFollowUpLevel(tenantSlug, {
        branchId,
        name: name.trim(),
        daysAfterDue: d,
      });
      setName("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create level");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
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
