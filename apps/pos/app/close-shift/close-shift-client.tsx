"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { usePos } from "@/components/pos-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupervisorPinDialog } from "@/features/approvals/ui/supervisor-pin-dialog";
import {
  closePosSession,
  getPosStatement,
  patchPosStatementLine,
  postPosStatement,
  postSessionStatement,
} from "@/lib/services/pos-sessions";
import { posToast } from "@/lib/pos-toast";

const VARIANCE_APPROVAL_THRESHOLD = 0.01;

type StatementLine = {
  id: string;
  paymentBucket: string;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
};

export function CloseShiftClient() {
  const {
    currentUser,
    posSessionId,
    posSessionLoading,
    refreshPosSession,
    posSessionPaused,
    resumePosShift,
  } = usePos();

  const tenantSlug = currentUser?.tenantSlug?.trim() ?? "";
  const [statementId, setStatementId] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<StatementLine[]>([]);
  const [status, setStatus] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [varianceApprovalId, setVarianceApprovalId] = React.useState<
    string | null
  >(null);
  const [supervisorOpen, setSupervisorOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<
    "post" | "close" | null
  >(null);

  const totalVariance = lines.reduce(
    (sum, ln) => sum + Math.abs(ln.difference),
    0,
  );
  const needsVarianceApproval = totalVariance > VARIANCE_APPROVAL_THRESHOLD;

  const loadStatement = React.useCallback(
    async (id: string) => {
      if (!tenantSlug) return;
      const res = (await getPosStatement(tenantSlug, id)) as {
        statement: { id: string; status: string; lines: StatementLine[] };
      };
      setStatementId(res.statement.id);
      setStatus(res.statement.status);
      setLines(res.statement.lines);
      const d: Record<string, string> = {};
      for (const ln of res.statement.lines) {
        d[ln.id] = String(ln.actualAmount);
      }
      setDrafts(d);
    },
    [tenantSlug],
  );

  const handleOpenStatement = async () => {
    if (!tenantSlug || !posSessionId) {
      posToast.warning("No shift", "Open a shift before closing.");
      return;
    }
    if (posSessionPaused) {
      const resumed = await resumePosShift();
      if (!resumed) return;
    }
    setLoading(true);
    try {
      const res = (await postSessionStatement(tenantSlug, posSessionId)) as {
        statement: { id: string; status: string; lines: StatementLine[] };
      };
      await loadStatement(res.statement.id);
      posToast.success("Statement opened", "Enter counted cash, then post.");
    } catch (e) {
      posToast.error(
        "Failed",
        e instanceof Error ? e.message : "Could not open statement.",
      );
    } finally {
      setLoading(false);
    }
  };

  const saveLine = async (lineId: string) => {
    if (!tenantSlug || !statementId || status !== "open") return;
    const raw = drafts[lineId]?.replaceAll(",", ".").trim() ?? "";
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      posToast.warning("Invalid amount", "Enter a non-negative number.");
      return;
    }
    setLoading(true);
    try {
      const res = (await patchPosStatementLine(
        tenantSlug,
        statementId,
        lineId,
        n,
      )) as { statement: { lines: StatementLine[]; status: string } };
      setLines(res.statement.lines);
      setStatus(res.statement.status);
      setVarianceApprovalId(null);
    } catch (e) {
      posToast.error(
        "Save failed",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const runPost = async (approvalId?: string) => {
    if (!tenantSlug || !statementId) return;
    const effectiveApprovalId = approvalId ?? varianceApprovalId;
    if (needsVarianceApproval && !effectiveApprovalId) {
      setPendingAction("post");
      setSupervisorOpen(true);
      return;
    }
    setLoading(true);
    try {
      await postPosStatement(tenantSlug, statementId, {
        varianceApprovalId: effectiveApprovalId ?? undefined,
      });
      await loadStatement(statementId);
      posToast.success("Posted", "Variance journal created if needed.");
    } catch (e) {
      posToast.error(
        "Post failed",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const runClose = async (approvalId?: string) => {
    if (!tenantSlug || !posSessionId) return;
    const effectiveApprovalId = approvalId ?? varianceApprovalId;
    if (needsVarianceApproval && !effectiveApprovalId) {
      setPendingAction("close");
      setSupervisorOpen(true);
      return;
    }
    setClosing(true);
    try {
      await closePosSession(tenantSlug, posSessionId, {
        varianceApprovalId: effectiveApprovalId ?? undefined,
      });
      await refreshPosSession();
      setStatementId(null);
      setLines([]);
      setStatus("");
      setVarianceApprovalId(null);
      posToast.success("Shift closed", "Open a new shift when you return.");
      window.location.href = "/";
    } catch (e) {
      posToast.error(
        "Close failed",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setClosing(false);
    }
  };

  if (posSessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!posSessionId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          No open shift. Open a shift from the register first.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to register
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Close shift</h1>
          <p className="text-sm text-muted-foreground">
            Count the drawer, post the statement, then close the session.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Register
          </Link>
        </Button>
      </div>

      {!statementId ? (
        <Button
          type="button"
          className="w-full"
          disabled={loading}
          onClick={() => void handleOpenStatement()}
        >
          {loading ? "Opening…" : "Start cash count"}
        </Button>
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Statement</span>
            <span className="font-medium uppercase">{status}</span>
          </div>

          {needsVarianceApproval ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Cash variance {totalVariance.toFixed(2)} requires supervisor
              approval before posting or closing.
            </p>
          ) : null}

          <div className="space-y-4">
            {lines.map((ln) => (
              <div key={ln.id} className="space-y-2 border-b pb-3 last:border-0">
                <Label className="capitalize">{ln.paymentBucket}</Label>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Expected</span>
                  <span className="text-right font-mono text-foreground">
                    {ln.expectedAmount.toFixed(2)}
                  </span>
                </div>
                <Input
                  className="font-mono text-right"
                  disabled={status !== "open" || loading}
                  value={drafts[ln.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [ln.id]: e.target.value }))
                  }
                  onBlur={() => void saveLine(ln.id)}
                />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-muted-foreground">Difference</span>
                  <span
                    className={`text-right font-mono ${
                      Math.abs(ln.difference) > 0.005
                        ? "text-amber-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {ln.difference.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {status === "open" && (
            <Button
              type="button"
              className="w-full"
              disabled={loading}
              onClick={() => void runPost()}
            >
              Post statement
            </Button>
          )}

          {status === "posted" && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={closing}
              onClick={() => void runClose()}
            >
              {closing ? "Closing…" : "Close shift and finish"}
            </Button>
          )}
        </div>
      )}

      {tenantSlug && posSessionId ? (
        <SupervisorPinDialog
          open={supervisorOpen}
          onOpenChange={setSupervisorOpen}
          tenantSlug={tenantSlug}
          title="Supervisor approval for cash variance"
          approvalRequest={{
            actionType: "cash_variance",
            payload: { sessionId: posSessionId, totalVariance },
          }}
          onApproved={(s) => {
            if (!s.approvalId) return;
            setVarianceApprovalId(s.approvalId);
            if (pendingAction === "post") {
              void runPost(s.approvalId);
            } else if (pendingAction === "close") {
              void runClose(s.approvalId);
            }
            setPendingAction(null);
          }}
        />
      ) : null}
    </div>
  );
}
