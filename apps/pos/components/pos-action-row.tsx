"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@repo/ui/button";
import { cn } from "@/lib/utils";
import { clearAuthToken } from "@/lib/auth-client";
import { Input } from "@repo/ui/input";

import { usePos } from "./pos-context";
import { PAYMENT_METHODS } from "@/features/register/model/constants";
import { CurrencyEntryDialog } from "@/components/currency-entry-dialog";
import { cartTotals } from "@/features/register/model/totals";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Three contextual button sets occupy the same footer strip:
 *   - "idle"        : cart is empty            (5 buttons)
 *   - "lineActions" : cart has items, in cart  (6 buttons)
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
  warning: "bg-amber-500 text-white hover:bg-amber-600",
};

const MODE_GRID: Record<ActionMode, string> = {
  idle: "grid-cols-5",
  lineActions: "grid-cols-6",
  payment: "grid-cols-9",
  supervisor: "grid-cols-3",
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

/** Prompt the user for a numeric value in [0, 100]. Returns null if cancelled or invalid. */
function promptPercentage(message: string, current?: number): number | null {
  const raw = window.prompt(message, current != null ? String(current) : "");
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    window.alert("Enter a number between 0 and 100.");
    return null;
  }
  return n;
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
    setLineComment,
    completePayment,
    goToPayment,
  } = usePos();

  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = React.useState(false);
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

  const { total } = cartTotals(cart, discount);

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

  const handleZReport = React.useCallback(() => {
    window.alert("Z-Report: not wired yet.");
  }, []);

  const handleXReport = React.useCallback(() => {
    window.alert("X-Report: not wired yet.");
  }, []);

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
      window.alert("Select a line first to apply a line discount.");
      return;
    }
    const pct = promptPercentage("Line discount percentage (0–100):");
    if (pct == null) return;
    applyLineDiscountPct(pct);
  }, [selectedLineId, applyLineDiscountPct]);

  const handleTotalDiscount = React.useCallback(() => {
    const pct = promptPercentage("Total discount percentage (0–100):");
    if (pct == null) return;
    applyTotalDiscountPct(pct);
  }, [applyTotalDiscountPct]);

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
        tone: "default" as const,
        onClick: () => {
          setPendingPayment({ id: m.id, label: m.label });
          setEnteredAmount(total > 0 ? total.toFixed(2) : "");
          setIsCurrencyDialogOpen(true);
        },
      })),
    [total],
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
        id: "sup-z",
        label: "Z-Report",
        tone: "brand",
        onClick: handleZReport,
      },
      {
        id: "sup-x",
        label: "X-Report",
        tone: "brand",
        onClick: handleXReport,
      },
    ],
    [handleSupervisorBack, handleZReport, handleXReport],
  );

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
            window.alert("Enter a valid amount.");
            return;
          }
          setIsCurrencyDialogOpen(false);
          void completePayment(pendingPayment.label, pendingPayment.id);
          setPendingPayment(null);
        }}
      />

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
    </>
  );
}
