"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearAuthToken } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";

import { usePos } from "./pos-context";
import {
  CASH_PAYMENT_METHOD_ID,
  PAYMENT_METHODS,
} from "@/features/register/model/constants";
import { CurrencyEntryDialog } from "@/components/currency-entry-dialog";
import { PercentageEntryDialog } from "@/components/percentage-entry-dialog";
import {
  billableCartLines,
  cartTotals,
  roundMoney,
} from "@/features/register/model/totals";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { posToast } from "@/lib/pos-toast";
import { getXReport } from "@/lib/api";
import { getEffectiveClientBranchId } from "@/lib/branch-access";
import { CashMovementDialog } from "@/components/cash-movement-dialog";
import { SupervisorPinDialog } from "@/features/approvals/ui/supervisor-pin-dialog";
import {
  isManagerTierRole,
  maxDiscountPercentForRole,
} from "@/features/register/model/discount-policy";

/**
 * Three contextual button sets occupy the same footer strip:
 *   - "idle"        : cart is empty            (5 buttons)
 *   - "lineActions" : cart has items, in cart  (7 buttons)
 *   - "payment"     : checkoutStep === payment (9 buttons)
 *
 * Adding/reordering buttons is a one-liner — each set is a config array
 * consumed by a single <ActionButton> component.
 */

type ActionTone = "default" | "brand" | "danger" | "warning";

type ActionDescriptor = {
  id: string;
  label: string;
  tone?: ActionTone;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

type ActionMode = "idle" | "lineActions" | "payment" | "supervisor";

const TONE_CLASSES: Record<ActionTone, string> = {
  default:
    "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-100",
  brand: "bg-(--pos-brand) text-white hover:opacity-90 [--pos-brand:#0d968b]",
  danger: "bg-red-600 text-white hover:bg-red-700",
  warning: "bg-amber-500 text-black hover:bg-amber-600",
};

const MODE_GRID: Record<ActionMode, string> = {
  idle: "grid-cols-5",
  lineActions: "grid-cols-7",
  payment: "grid-cols-9",
  supervisor: "grid-cols-5",
};

function ActionButton({
  label,
  tone = "default",
  href,
  onClick,
  disabled,
}: ActionDescriptor) {
  const classes = cn(
    "h-full w-full rounded-none border-0 px-2 text-[10px] font-bold uppercase tracking-tight",
    "disabled:opacity-50 whitespace-normal leading-tight",
    TONE_CLASSES[tone],
  );

  if (href) {
    return (
      <Link href={href} className="h-full">
        <Button
          type="button"
          variant="outline"
          className={classes}
          onClick={onClick}
          disabled={disabled}
        >
          {label}
        </Button>
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={classes}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

export function PosActionRow() {
  const {
    mainTab,
    checkoutStep,
    cart,
    setCart,
    discount,
    selectedLineId,
    supervisorMode,
    setSupervisorMode,
    clearCart,
    voidAll,
    voidSelectedLine,
    triggerTotalAndPay,
    applyLineDiscountPct,
    applyTotalDiscountPct,
    setDiscountApprovalId,
    setLineComment,
    completePayment,
    goToPayment,
    currentUser,
    posSessionId,
    posSessionStatus,
    pausePosShift,
    resumePosShift,
  } = usePos();

  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = React.useState(false);
  const [isCashMovementOpen, setIsCashMovementOpen] = React.useState(false);
  const [isXReportOpen, setIsXReportOpen] = React.useState(false);
  const [xReportLoading, setXReportLoading] = React.useState(false);
  const [xReportBody, setXReportBody] = React.useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = React.useState<{
    id: string;
    label: string;
  } | null>(null);
  const [enteredAmount, setEnteredAmount] = React.useState("");

  const [isCommentDialogOpen, setIsCommentDialogOpen] = React.useState(false);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [commentScope, setCommentScope] = React.useState<"selected" | "all">(
    "selected",
  );

  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = React.useState(false);

  const [isPctDialogOpen, setIsPctDialogOpen] = React.useState(false);
  const [pctDraft, setPctDraft] = React.useState("");
  const [pctKind, setPctKind] = React.useState<"line" | "total" | null>(null);
  const [supervisorPctOpen, setSupervisorPctOpen] = React.useState(false);
  const [pendingSupervisorPct, setPendingSupervisorPct] = React.useState<{
    kind: "line" | "total";
    pct: number;
  } | null>(null);
  const [isLineDiscountHintOpen, setIsLineDiscountHintOpen] =
    React.useState(false);

  const { total } = cartTotals(billableCartLines(cart), discount);
  const payableTotal = roundMoney(total);

  React.useEffect(() => {
    if (!isCurrencyDialogOpen || !pendingPayment) return;
    setEnteredAmount(payableTotal > 0 ? payableTotal.toFixed(2) : "");
  }, [isCurrencyDialogOpen, pendingPayment?.id, payableTotal]);

  const handleLogout = React.useCallback(() => {
    setIsLogoutDialogOpen(true);
  }, []);

  const confirmLogout = React.useCallback(() => {
    clearAuthToken();
    window.location.reload();
  }, []);

  const handleSupervisor = React.useCallback(() => {
    setSupervisorMode(true);
  }, [setSupervisorMode]);

  const handleSupervisorBack = React.useCallback(() => {
    // Spec requirement: return to the previous screen where the cart is empty
    // and show the default 5-button set.
    clearCart();
    setSupervisorMode(false);
  }, [clearCart, setSupervisorMode]);

  const handleXReport = React.useCallback(() => {
    const slug = currentUser?.tenantSlug?.trim();
    if (!slug || !posSessionId) {
      posToast.warning(
        "X-Report",
        "Open a shift with a branch scope before running X-Report.",
      );
      return;
    }
    setIsXReportOpen(true);
    setXReportLoading(true);
    setXReportBody(null);
    void (async () => {
      try {
        const data = await getXReport(slug, posSessionId);
        setXReportBody(JSON.stringify(data, null, 2));
      } catch (e) {
        setXReportBody(
          e instanceof Error ? e.message : "Could not load X-Report.",
        );
      } finally {
        setXReportLoading(false);
      }
    })();
  }, [currentUser?.tenantSlug, posSessionId]);

  const handleComment = React.useCallback(() => {
    if (cart.length === 0) return;

    if (!selectedLineId) {
      setCommentScope("all");
      setCommentDraft("");
      setIsCommentDialogOpen(true);
      return;
    }

    setCommentScope("selected");
    const current =
      cart.find((l) => l.lineId === selectedLineId)?.comment?.trim() ?? "";
    setCommentDraft(current);
    setIsCommentDialogOpen(true);
  }, [cart, selectedLineId]);

  const handleLineDiscount = React.useCallback(() => {
    if (!selectedLineId) {
      setIsLineDiscountHintOpen(true);
      return;
    }
    setPctKind("line");
    setPctDraft("");
    setIsPctDialogOpen(true);
  }, [selectedLineId]);

  const handleTotalDiscount = React.useCallback(() => {
    setPctKind("total");
    setPctDraft("");
    setIsPctDialogOpen(true);
  }, []);

  const closePctDialog = React.useCallback(() => {
    setIsPctDialogOpen(false);
    setPctKind(null);
    setPctDraft("");
  }, []);

  const confirmPctDialog = React.useCallback(() => {
    const normalized = pctDraft.replaceAll(",", ".").trim();
    if (normalized.length === 0) {
      posToast.warning(
        "Percentage required",
        "Enter a discount percentage between 0 and 100.",
      );
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      posToast.error(
        "Invalid percentage",
        "Use a number from 0 to 100 (decimals allowed).",
      );
      return;
    }
    const role =
      isManagerTierRole(currentUser?.role) ? currentUser?.role : "cashier";
    const maxPct = maxDiscountPercentForRole(role);
    if (n > maxPct + 1e-9 && pctKind) {
      setPendingSupervisorPct({ kind: pctKind, pct: n });
      closePctDialog();
      setSupervisorPctOpen(true);
      return;
    }
    if (pctKind === "line") {
      applyLineDiscountPct(n);
    } else if (pctKind === "total") {
      applyTotalDiscountPct(n);
    }
    closePctDialog();
  }, [
    pctDraft,
    pctKind,
    currentUser?.role,
    applyLineDiscountPct,
    applyTotalDiscountPct,
    closePctDialog,
  ]);

  const applySupervisorApprovedDiscount = React.useCallback(
    (approvalId?: string) => {
      if (!pendingSupervisorPct) return;
      const opts = { supervisorApproved: true as const };
      if (pendingSupervisorPct.kind === "line") {
        applyLineDiscountPct(pendingSupervisorPct.pct, opts);
      } else {
        applyTotalDiscountPct(pendingSupervisorPct.pct, opts);
      }
      if (approvalId) setDiscountApprovalId(approvalId);
      setPendingSupervisorPct(null);
      setSupervisorPctOpen(false);
      posToast.success("Supervisor approved discount");
    },
    [
      pendingSupervisorPct,
      applyLineDiscountPct,
      applyTotalDiscountPct,
      setDiscountApprovalId,
    ],
  );

  const mode: ActionMode = supervisorMode
    ? "supervisor"
    : checkoutStep === "payment"
      ? "payment"
      : cart.length > 0
        ? "lineActions"
        : "idle";

  const idleButtons: ActionDescriptor[] = React.useMemo(
    () => [
      { id: "logoff", label: "Logoff", tone: "danger", onClick: handleLogout },
      {
        id: "transactions",
        label: "Transactions",
        tone: "default",
        href: "/transactions",
      },
      {
        id: "supervisor",
        label: "Supervisor",
        tone: "default",
        onClick: handleSupervisor,
      },
      {
        id: "recall",
        label: "Recall/Hold",
        tone: "warning",
        href: "/suspended",
      },
      {
        id: "start",
        label: "Start",
        tone: "brand",
        onClick: goToPayment,
      },
    ],
    [handleLogout, handleSupervisor, goToPayment, cart.length],
  );

  const lineActionButtons: ActionDescriptor[] = React.useMemo(
    () => [
      { id: "void-all", label: "Void All", tone: "danger", onClick: voidAll },
      {
        id: "void-line",
        label: "Void Line",
        tone: "danger",
        onClick: voidSelectedLine,
      },
      {
        id: "comment",
        label: "Comment",
        tone: "default",
        onClick: handleComment,
      },
      {
        id: "line-disc",
        label: "Line Discount %",
        tone: "default",
        onClick: handleLineDiscount,
      },
      {
        id: "total-disc",
        label: "Total Discount %",
        tone: "default",
        onClick: handleTotalDiscount,
      },
      {
        id: "customer",
        label: "Customer",
        tone: "default",
        href: "/customers",
      },
      {
        id: "total",
        label: "Total",
        tone: "brand",
        onClick: triggerTotalAndPay,
      },
    ],
    [
      voidAll,
      voidSelectedLine,
      selectedLineId,
      handleComment,
      handleLineDiscount,
      handleTotalDiscount,
      triggerTotalAndPay,
    ],
  );

  const paymentButtons: ActionDescriptor[] = React.useMemo(
    () =>
      PAYMENT_METHODS.map((m) => ({
        id: m.id,
        label: m.label,
        tone: "warning" as const,
        onClick: () => {
          if (payableTotal <= 0) {
            posToast.warning(
              "Nothing to pay",
              "Add billable items to the cart before taking payment.",
            );
            return;
          }
          setPendingPayment({ id: m.id, label: m.label });
          setEnteredAmount(payableTotal.toFixed(2));
          setIsCurrencyDialogOpen(true);
        },
      })),
    [payableTotal],
  );

  const supervisorButtons: ActionDescriptor[] = React.useMemo(
    () => [
      {
        id: "sup-back",
        label: "Back",
        tone: "danger",
        onClick: handleSupervisorBack,
      },
      {
        id: "sup-lock",
        label: posSessionStatus === "paused" ? "Resume" : "Lock",
        tone: "warning",
        disabled: !posSessionId,
        onClick: () => {
          if (posSessionStatus === "paused") void resumePosShift();
          else void pausePosShift();
        },
      },
      {
        id: "sup-close",
        label: "Close Shift",
        tone: "danger",
        href: "/close-shift",
        disabled: !posSessionId,
      },
      {
        id: "sup-z",
        label: "Z-Report",
        tone: "brand",
        href: "/z-report",
      },
      {
        id: "sup-x",
        label: "X-Report",
        tone: "brand",
        onClick: handleXReport,
      },
      {
        id: "sup-cash",
        label: "Cash",
        tone: "brand",
        disabled: !posSessionId,
        onClick: () => setIsCashMovementOpen(true),
      },
    ],
    [
      handleSupervisorBack,
      handleXReport,
      posSessionId,
      posSessionStatus,
      pausePosShift,
      resumePosShift,
    ],
  );

  const closeXReport = React.useCallback(() => {
    setIsXReportOpen(false);
    setXReportBody(null);
  }, []);

  const buttons =
    mode === "idle"
      ? idleButtons
      : mode === "lineActions"
        ? lineActionButtons
        : mode === "payment"
          ? paymentButtons
          : supervisorButtons;

  // Hide the row when not on the register tab so other tabs aren't cluttered.
  if (mainTab !== "register" && mode !== "idle") {
    return (
      <div
        className={cn("grid h-14 w-full gap-px bg-slate-800", MODE_GRID.idle)}
      >
        {idleButtons.map((b) => (
          <ActionButton key={b.id} {...b} />
        ))}
      </div>
    );
  }

  return (
    <>
      {mode === "payment" ? (
        <div className="flex h-14 w-full  bg-slate-800">
          {buttons.map((b) => (
            <div key={b.id} className="h-full min-w-[110px] flex-1">
              <ActionButton {...b} />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid h-14 w-full gap-px bg-slate-800",
            MODE_GRID[mode],
          )}
        >
          {buttons.map((b) => (
            <ActionButton key={b.id} {...b} />
          ))}
        </div>
      )}

      <CurrencyEntryDialog
        open={isCurrencyDialogOpen}
        onOpenChange={(open) => {
          setIsCurrencyDialogOpen(open);
          if (!open) setPendingPayment(null);
        }}
        value={enteredAmount}
        onValueChange={setEnteredAmount}
        onCancel={() => {
          setIsCurrencyDialogOpen(false);
          setPendingPayment(null);
        }}
        onOk={() => {
          if (!pendingPayment) return;
          const normalized = enteredAmount.replaceAll(",", "").trim();
          const amt = normalized.length > 0 ? Number(normalized) : NaN;
          if (!Number.isFinite(amt) || amt < 0) {
            posToast.error(
              "Invalid amount",
              "Enter a valid payment total using digits only.",
            );
            return;
          }
          const amtRounded = roundMoney(amt);
          if (
            pendingPayment.id !== CASH_PAYMENT_METHOD_ID &&
            Math.abs(amtRounded - payableTotal) > 0.009
          ) {
            posToast.error(
              "Exact amount required",
              `${pendingPayment.label} must match the balance due (${payableTotal.toFixed(2)}). Use Cash for change.`,
            );
            return;
          }
          setIsCurrencyDialogOpen(false);
          void completePayment(
            pendingPayment.label,
            pendingPayment.id,
            amtRounded,
          );
          setPendingPayment(null);
        }}
      />

      <PercentageEntryDialog
        open={isPctDialogOpen}
        onOpenChange={(open) => {
          if (!open) closePctDialog();
        }}
        value={pctDraft}
        onValueChange={setPctDraft}
        title={
          pctKind === "total"
            ? "Total discount %"
            : pctKind === "line"
              ? "Line discount %"
              : "Discount %"
        }
        onCancel={closePctDialog}
        onOk={confirmPctDialog}
      />

      <Dialog
        open={isLineDiscountHintOpen}
        onOpenChange={setIsLineDiscountHintOpen}
      >
        <DialogContent className="w-[420px] max-w-sm gap-3 overflow-hidden rounded-none border-slate-600 bg-slate-900 p-0 text-white">
          <DialogHeader className="bg-amber-400 px-4 py-3">
            <DialogTitle className="text-base font-extrabold tracking-tight text-amber-950">
              Line discount
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2">
            <p className="text-sm font-semibold text-slate-200">
              Select a line in the cart first, then apply a line discount.
            </p>
          </div>
          <DialogFooter className="gap-2 rounded-none bg-slate-900 px-4 pb-4 sm:justify-end">
            <Button
              type="button"
              className="h-12 w-full rounded-none bg-emerald-500 font-extrabold text-emerald-950 hover:bg-emerald-400"
              onClick={() => setIsLineDiscountHintOpen(false)}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCommentDialogOpen}
        onOpenChange={(open) => {
          setIsCommentDialogOpen(open);
          if (!open) {
            setCommentDraft("");
            setCommentScope("selected");
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-[420px] max-w-sm gap-3 overflow-hidden rounded-none border-slate-600 bg-slate-900 p-4 text-white"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold tracking-tight">
              Comment
            </DialogTitle>
          </DialogHeader>

          <Input
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            className="h-12 rounded-none border-slate-600 bg-slate-800 font-semibold text-white placeholder:text-slate-400 focus-visible:ring-0"
            placeholder="Type comment..."
            autoFocus
          />

          <DialogFooter
            showCloseButton={false}
            className="gap-2 sm:justify-end rounded-none bg-slate-900 p-4 border-0 flex justify-between flex-1"
          >
            <div className="flex-1">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-none bg-slate-800 text-white hover:bg-slate-700"
                onClick={() => setIsCommentDialogOpen(false)}
              >
                Cancel
              </Button>
            </div>
            <div className="flex-1">
              <Button
                type="button"
                className="h-12 w-full rounded-none bg-emerald-500 font-extrabold text-emerald-950 hover:bg-emerald-400"
                onClick={() => {
                  if (commentScope === "all") {
                    const nextComment = commentDraft.trim() || undefined;
                    setCart((prev) =>
                      prev.map((l) => ({ ...l, comment: nextComment })),
                    );
                  } else {
                    setLineComment(commentDraft);
                  }
                  setIsCommentDialogOpen(false);
                }}
              >
                OK
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <DialogContent className="w-[420px] max-w-sm gap-3 overflow-hidden rounded-none border-slate-600 bg-slate-900 p-0 text-white">
          <DialogHeader className="bg-rose-400 px-4 py-3">
            <DialogTitle className="text-base font-extrabold tracking-tight text-rose-950">
              End session?
            </DialogTitle>
          </DialogHeader>

          <div className="px-4 pb-2">
            <p className="text-sm font-semibold text-slate-200">
              End session and log out?
            </p>
          </div>

          <DialogFooter className="gap-2 rounded-none bg-slate-900 px-4 pb-4 sm:justify-end">
            <div className="flex-1">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-none bg-slate-800 text-white hover:bg-slate-700"
                onClick={() => setIsLogoutDialogOpen(false)}
              >
                Cancel
              </Button>
            </div>
            <div className="flex-1">
              <Button
                type="button"
                className="h-12 w-full rounded-none bg-rose-400 font-extrabold text-rose-950 hover:bg-rose-300"
                onClick={confirmLogout}
              >
                Log out
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isXReportOpen} onOpenChange={(o) => !o && closeXReport()}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto rounded-none border-slate-600 bg-slate-900 p-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold tracking-tight">
              X-Report (read-only)
            </DialogTitle>
          </DialogHeader>
          {xReportLoading ? (
            <p className="text-sm text-slate-300">Loading…</p>
          ) : (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all text-left text-xs text-slate-200">
              {xReportBody}
            </pre>
          )}
          <DialogFooter className="mt-2">
            <Button
              type="button"
              className="w-full rounded-none"
              onClick={closeXReport}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {posSessionId && currentUser?.tenantSlug ? (
        <CashMovementDialog
          open={isCashMovementOpen}
          onOpenChange={setIsCashMovementOpen}
          tenantSlug={currentUser.tenantSlug}
          sessionId={posSessionId}
          branchId={getEffectiveClientBranchId() ?? ""}
        />
      ) : null}

      {currentUser?.tenantSlug ? (
        <SupervisorPinDialog
          open={supervisorPctOpen}
          onOpenChange={(open) => {
            setSupervisorPctOpen(open);
            if (!open) setPendingSupervisorPct(null);
          }}
          tenantSlug={currentUser.tenantSlug}
          title="Supervisor approval required"
          approvalRequest={
            pendingSupervisorPct
              ? {
                  actionType: "large_discount",
                  payload: { percent: pendingSupervisorPct.pct },
                }
              : undefined
          }
          onApproved={(s) => applySupervisorApprovedDiscount(s.approvalId)}
        />
      ) : null}
    </>
  );
}
