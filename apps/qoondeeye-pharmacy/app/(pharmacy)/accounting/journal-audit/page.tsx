"use client";

import * as React from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import {
  getJournalAudit,
  type JournalAuditResult,
} from "@/lib/services/accounting";

export default function JournalAuditPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [asOf, setAsOf] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [result, setResult] = React.useState<JournalAuditResult | null>(null);
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
      setResult(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await getJournalAudit(tenantSlug, branchId, asOf);
      setResult(r);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load journal audit");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId, asOf]);

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
          Select a branch to run the audit.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Journal audit</CardTitle>
          <CardDescription>
            Trial-style control totals through the selected date and detection
            of unbalanced journal entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ja-asof">As of</Label>
              <Input
                id="ja-asof"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="w-[148px]"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={loading || !branchId}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Refresh
            </Button>
          </div>

          {loading && !result ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                  result.isBalanced
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {result.isBalanced ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0" />
                )}
                <span>
                  {result.isBalanced
                    ? "Debits and credits match through this date."
                    : `Out of balance by ${money(Math.abs(result.difference))}.`}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">
                    Total debits
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {money(result.totalDebits)}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">
                    Total credits
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {money(result.totalCredits)}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">
                    Difference (Dr − Cr)
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {money(result.difference)}
                  </div>
                </div>
              </div>
              {result.unbalancedEntryIds.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Unbalanced entries (showing up to 50)
                  </p>
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {result.unbalancedEntryIds.map((id) => (
                      <li key={id}>
                        <code className="text-xs">{id}</code> — see{" "}
                        <Link
                          href="/accounting/journals"
                          className="text-primary underline"
                        >
                          Journal entries
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
