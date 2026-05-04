"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getStoredUser } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import {
  closePosSession,
  getCurrentPosSession,
  getPosStatement,
  patchPosStatementLine,
  postPosStatement,
  postSessionStatement,
} from "@/lib/services/pos-sessions";

type StatementLine = {
  id: string;
  paymentBucket: string;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
};

export default function AccountingPosStatementPage() {
  const [slug] = React.useState(
    () => getStoredUser()?.tenantSlug?.trim() ?? null,
  );

  const [posSessionId, setPosSessionId] = React.useState<string | null>(null);
  const [posSessionLoading, setPosSessionLoading] = React.useState(true);
  const [closing, setClosing] = React.useState(false);

  const [statementId, setStatementId] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<StatementLine[]>([]);
  const [status, setStatus] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const refreshPosSession = React.useCallback(async () => {
    if (!slug) {
      setPosSessionId(null);
      setPosSessionLoading(false);
      return;
    }
    setPosSessionLoading(true);
    try {
      const s = await getCurrentPosSession(slug);
      setPosSessionId(s?.id ?? null);
    } catch {
      setPosSessionId(null);
    } finally {
      setPosSessionLoading(false);
    }
  }, [slug]);

  const loadStatement = React.useCallback(
    async (id: string) => {
      if (!slug) return;
      const res = (await getPosStatement(slug, id)) as {
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
    [slug],
  );

  React.useEffect(() => {
    void refreshPosSession();
  }, [refreshPosSession]);

  const handleOpenStatement = React.useCallback(async () => {
    if (!slug || !posSessionId) {
      toast.warning("No session", { description: "Open a shift on the POS first." });
      return;
    }
    setLoading(true);
    try {
      const res = (await postSessionStatement(slug, posSessionId)) as {
        statement: { id: string; status: string; lines: StatementLine[] };
      };
      await loadStatement(res.statement.id);
      toast.success("Statement opened", {
        description: "Enter counted amounts, then post.",
      });
    } catch (e) {
      toast.error("Failed", {
        description:
          e instanceof Error ? e.message : "Could not open statement.",
      });
    } finally {
      setLoading(false);
    }
  }, [slug, posSessionId, loadStatement]);

  const saveLine = async (lineId: string) => {
    if (!slug || !statementId || status !== "open") return;
    const raw = drafts[lineId]?.replaceAll(",", ".").trim() ?? "";
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      toast.warning("Invalid amount", {
        description: "Enter a non-negative number.",
      });
      return;
    }
    setLoading(true);
    try {
      const res = (await patchPosStatementLine(
        slug,
        statementId,
        lineId,
        n,
      )) as { statement: { lines: StatementLine[]; status: string } };
      setLines(res.statement.lines);
      setStatus(res.statement.status);
      toast.success("Saved", { description: "Line updated." });
    } catch (e) {
      toast.error("Save failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!slug || !statementId) return;
    setLoading(true);
    try {
      await postPosStatement(slug, statementId);
      await loadStatement(statementId);
      toast.success("Posted", {
        description: "Variance journal created (if any).",
      });
    } catch (e) {
      toast.error("Post failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!slug || !posSessionId) return;
    setClosing(true);
    try {
      await closePosSession(slug, posSessionId);
      await refreshPosSession();
      setStatementId(null);
      setLines([]);
      setStatus("");
      toast.success("Shift closed", {
        description: "You can open a new shift on the POS when ready.",
      });
    } catch (e) {
      toast.error("Close failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setClosing(false);
    }
  };

  if (!slug) {
    return (
      <div className="px-4 py-6 md:px-8">
        <p className="text-muted-foreground text-sm">Sign in to continue.</p>
      </div>
    );
  }

  return (
    <Card className="mx-4 mb-4 mt-4 max-w-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">POS statement</CardTitle>
          <CardDescription>
            Shift cash declaration and posting (same flow as the POS terminal).
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={ROUTES.accounting.root}>Accounting</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {posSessionLoading ? (
          <p className="text-muted-foreground text-sm">Loading session…</p>
        ) : !posSessionId ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-950 dark:text-amber-100">
            No open shift for this branch. Open a shift from the POS register,
            then return here.
          </p>
        ) : (
          <>
            {!statementId && (
              <Button
                type="button"
                disabled={loading}
                onClick={() => void handleOpenStatement()}
              >
                Open statement
              </Button>
            )}

            {statementId && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium uppercase">{status}</span>
                </div>

                <div className="space-y-3">
                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      className="grid grid-cols-2 gap-2 border-b border-border/80 pb-3 last:border-0"
                    >
                      <div className="col-span-2 font-medium capitalize">
                        {ln.paymentBucket}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expected
                      </div>
                      <div className="text-right font-mono text-sm">
                        {ln.expectedAmount.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">Actual</div>
                      <Input
                        className="h-8 font-mono text-right text-sm"
                        disabled={status !== "open" || loading}
                        value={drafts[ln.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [ln.id]: e.target.value }))
                        }
                        onBlur={() => void saveLine(ln.id)}
                      />
                      <div className="text-xs text-muted-foreground">
                        Difference
                      </div>
                      <div
                        className={`text-right font-mono text-sm ${
                          Math.abs(ln.difference) > 0.005
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {ln.difference.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                {status === "open" && (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={loading}
                    onClick={() => void handlePost()}
                  >
                    Post statement
                  </Button>
                )}

                {status === "posted" && posSessionId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={closing}
                    onClick={() => void handleCloseShift()}
                  >
                    Close shift
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
