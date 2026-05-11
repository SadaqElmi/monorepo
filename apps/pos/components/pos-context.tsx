"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PosTransaction, PosCartLine, PosHeldOrder } from "@repo/types";
import { getResolvedStoredUser, type StoredUser } from "@/lib/auth-client";
import {
  loadPosTransactions,
  loadHeldOrders,
  persistHeldOrders,
  persistPosTransactions,
  cloneLines,
  newReceiptId,
} from "@/lib/pos-utils";
import { createSale } from "@/lib/api";
import type { CreateSaleInput, Sale } from "@repo/types";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import {
  getCurrentPosSession,
  openPosSession,
} from "@/lib/services/pos-sessions";
import { getEffectiveClientBranchId } from "@/lib/branch-access";
import {
  billableCartLines,
  cartTotals,
} from "@/features/register/model/totals";
import {
  isManagerTierRole,
  maxDiscountPercentForRole,
} from "@/features/register/model/discount-policy";
import { posToast } from "@/lib/pos-toast";

type PosContextType = {
  mainTab: "register" | "returns";
  setMainTab: (tab: "register" | "returns") => void;
  checkoutStep: "cart" | "payment";
  setCheckoutStep: (step: "cart" | "payment") => void;
  transactions: PosTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<PosTransaction[]>>;
  currentUser: StoredUser | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<StoredUser | null>>;
  cart: PosCartLine[];
  setCart: React.Dispatch<React.SetStateAction<PosCartLine[]>>;
  discount: number;
  setDiscount: (discount: number) => void;
  heldOrders: PosHeldOrder[];
  setHeldOrders: React.Dispatch<React.SetStateAction<PosHeldOrder[]>>;
  /** Currently highlighted cart line. Drives Void Line / Comment / Line Discount %. */
  selectedLineId: string | null;
  setSelectedLineId: React.Dispatch<React.SetStateAction<string | null>>;
  /** When true, the cart UI renders a synthetic "VAT 5%" row at the top. */
  showVatLine: boolean;
  setShowVatLine: React.Dispatch<React.SetStateAction<boolean>>;
  /** Latest completed sale awaiting print; consumers render a printable receipt. */
  receiptToPrint: PosTransaction | null;
  setReceiptToPrint: React.Dispatch<
    React.SetStateAction<PosTransaction | null>
  >;
  /** When true, the footer shows Supervisor actions (Back/Z/X reports). */
  supervisorMode: boolean;
  setSupervisorMode: React.Dispatch<React.SetStateAction<boolean>>;
  /**
   * Manager/admin can temporarily step down (footer MANAGER: INACTIVE, 1% discount cap).
   * Cleared on re-login or when the signed-in user changes.
   */
  managerPrivilegesSuspended: boolean;
  setManagerPrivilegesSuspended: React.Dispatch<React.SetStateAction<boolean>>;
  /** True when signed-in user is manager tier and not stepped down. */
  managerTierActiveForUi: boolean;
  clearCart: () => void;
  /** Cancel current entry/flow (clear selection & payment state) without clearing the cart. */
  cancelEntry: () => void;
  holdOrder: () => void;
  recallHeld: (order: PosHeldOrder) => void;
  removeHeld: (id: string) => void;
  goToPayment: () => void;
  /** Clear every line and reset selection / VAT flag. */
  voidAll: () => void;
  /** Remove the line at `selectedLineId`. No-op when nothing is selected. */
  voidSelectedLine: () => void;
  /** Show the synthetic VAT line and switch to the payment step. */
  triggerTotalAndPay: () => void;
  /** Apply a per-line discount (0..100) to the selected line. */
  applyLineDiscountPct: (pct: number) => void;
  /** Apply a global percentage discount calculated against the cart subtotal. */
  applyTotalDiscountPct: (pct: number) => void;
  /** Attach / replace a free-form comment on the selected line. */
  setLineComment: (text: string) => void;
  /** Persist the sale (server when online, local otherwise) and reset state. */
  completePayment: (
    paymentLabel: string,
    paymentMethodCode?: string,
    amountTendered?: number,
  ) => Promise<void>;
  /** Open shift session id for the current branch, or null. */
  posSessionId: string | null;
  posSessionLoading: boolean;
  refreshPosSession: () => Promise<void>;
  openPosShift: () => Promise<string | null>;
};

const PosContext = createContext<PosContextType | undefined>(undefined);

type CreateSaleMutatePayload = {
  tenantSlug: string;
  body: CreateSaleInput;
  optimisticSaleId: string;
  optimisticReceiptId: string;
};

type CreateSaleMutationCtx = {
  previous: Sale[] | undefined;
  queryKey: readonly unknown[];
};

export function PosProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const createSaleMutation = useMutation<
    Sale,
    Error,
    CreateSaleMutatePayload,
    CreateSaleMutationCtx
  >({
    mutationFn: async (payload) =>
      createSale(payload.tenantSlug, payload.body),
    onMutate: async (variables) => {
      const facet = getBranchQueryKeyFacet();
      const queryKey = [
        "pos",
        "sales",
        variables.tenantSlug,
        facet,
        1,
        200,
      ] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Sale[]>(queryKey);
      const optimisticSale: Sale = {
        id: variables.optimisticSaleId,
        branch_id: null,
        receipt_number: variables.optimisticReceiptId,
        total_amount: variables.body.totalAmount ?? null,
        discount: variables.body.discount ?? null,
        tax: variables.body.tax ?? null,
        sale_date: new Date().toISOString(),
        payment_method: variables.body.paymentMethod,
        items: [],
      };
      queryClient.setQueryData<Sale[]>(queryKey, (old) => {
        const base = old ?? [];
        const filtered = base.filter(
          (s) => s.id !== variables.optimisticSaleId,
        );
        return [optimisticSale, ...filtered].slice(0, 200);
      });
      return { previous, queryKey };
    },
    onSuccess: (data, variables) => {
      const facet = getBranchQueryKeyFacet();
      const queryKey = [
        "pos",
        "sales",
        variables.tenantSlug,
        facet,
        1,
        200,
      ] as const;
      queryClient.setQueryData<Sale[]>(queryKey, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.id === variables.optimisticSaleId ? data : row,
        );
      });
    },
    onError: (_e, variables, context) => {
      const qk = context?.queryKey;
      if (!qk) return;
      if (context?.previous !== undefined) {
        queryClient.setQueryData(qk, context.previous);
      } else {
        queryClient.setQueryData<Sale[]>(qk, (old) => {
          if (!old) return old;
          return old.filter((s) => s.id !== variables.optimisticSaleId);
        });
      }
    },
    onSettled: (_d, _e, variables) => {
      if (!variables?.tenantSlug) return;
      const facet = getBranchQueryKeyFacet();
      void queryClient.invalidateQueries({
        queryKey: ["pos", "sales", variables.tenantSlug, facet],
      });
    },
  });
  const [mainTab, setMainTab] = useState<"register" | "returns">("register");
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "payment">("cart");
  const [transactions, setTransactions] = useState<PosTransaction[]>([]);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(() =>
    typeof window !== "undefined" ? getResolvedStoredUser() : null,
  );
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [heldOrders, setHeldOrders] = useState<PosHeldOrder[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [showVatLine, setShowVatLine] = useState(false);
  const [receiptToPrint, setReceiptToPrint] = useState<PosTransaction | null>(
    null,
  );
  const [supervisorMode, setSupervisorMode] = useState(false);
  const [managerPrivilegesSuspended, setManagerPrivilegesSuspended] =
    useState(false);
  const [posSessionId, setPosSessionId] = useState<string | null>(null);
  const [posSessionLoading, setPosSessionLoading] = useState(false);

  const managerTierActiveForUi =
    isManagerTierRole(currentUser?.role) && !managerPrivilegesSuspended;

  const roleForDiscountPolicy = React.useMemo(() => {
    const r = currentUser?.role;
    if (isManagerTierRole(r) && managerPrivilegesSuspended) return "cashier";
    return r;
  }, [currentUser?.role, managerPrivilegesSuspended]);

  const refreshPosSession = useCallback(async () => {
    const slug = currentUser?.tenantSlug?.trim();
    const branchId = getEffectiveClientBranchId();
    if (!slug || currentUser?.userType !== "tenant" || !branchId) {
      setPosSessionId(null);
      return;
    }
    setPosSessionLoading(true);
    try {
      const row = await getCurrentPosSession(slug);
      setPosSessionId(row?.id ?? null);
    } catch {
      setPosSessionId(null);
    } finally {
      setPosSessionLoading(false);
    }
  }, [currentUser?.tenantSlug, currentUser?.userType]);

  /**
   * After login / route change: load open shift or POST `/pos/sessions/open` so the cashier
   * never has to tap “Open shift” when a branch is selected.
   */
  const ensurePosSessionWithAutoOpen = useCallback(async () => {
    const slug = currentUser?.tenantSlug?.trim();
    const branchId = getEffectiveClientBranchId();
    if (!slug || currentUser?.userType !== "tenant" || !branchId) {
      setPosSessionId(null);
      return;
    }
    setPosSessionLoading(true);
    try {
      let row = await getCurrentPosSession(slug);
      if (row?.id) {
        setPosSessionId(row.id);
        return;
      }
      try {
        const opened = await openPosSession(slug, {
          staffUserId: currentUser?.id,
        });
        setPosSessionId(opened.id);
      } catch {
        row = await getCurrentPosSession(slug);
        setPosSessionId(row?.id ?? null);
      }
    } catch {
      setPosSessionId(null);
    } finally {
      setPosSessionLoading(false);
    }
  }, [currentUser?.tenantSlug, currentUser?.userType, currentUser?.id]);

  const openPosShift = useCallback(async (): Promise<string | null> => {
    const slug = currentUser?.tenantSlug?.trim();
    const branchId = getEffectiveClientBranchId();
    if (!slug || currentUser?.userType !== "tenant" || !branchId) {
      posToast.warning(
        "Cannot open shift",
        "Select a single branch (not “All”) and sign in as tenant staff.",
      );
      return null;
    }
    try {
      const row = await openPosSession(slug, {
        staffUserId: currentUser?.id,
      });
      setPosSessionId(row.id);
      posToast.success("Shift opened", "You can ring sales for this session.");
      return row.id;
    } catch (e) {
      posToast.error(
        "Could not open shift",
        e instanceof Error ? e.message : "Try again.",
      );
      return null;
    }
  }, [currentUser?.tenantSlug, currentUser?.userType, currentUser?.id]);

  useEffect(() => {
    void ensurePosSessionWithAutoOpen();
  }, [pathname, ensurePosSessionWithAutoOpen]);

  useEffect(() => {
    setTransactions(loadPosTransactions());
    setHeldOrders(loadHeldOrders());
  }, []);

  // PosProvider sits in the root layout and survives client navigations (e.g. /staff-login → /).
  // Re-read session whenever the route changes so login updates tenantSlug for catalog / barcode APIs.
  useEffect(() => {
    setCurrentUser(getResolvedStoredUser());
  }, [pathname]);

  // Drop a stale selection if the line disappears from the cart.
  useEffect(() => {
    if (!selectedLineId) return;
    if (!cart.some((l) => l.lineId === selectedLineId)) {
      setSelectedLineId(null);
    }
  }, [cart, selectedLineId]);

  // VAT row only makes sense while the cart has items.
  useEffect(() => {
    if (cart.length === 0 && showVatLine) setShowVatLine(false);
  }, [cart.length, showVatLine]);

  // Supervisor mode is an idle workflow; leave it automatically if the user starts a sale.
  useEffect(() => {
    if (!supervisorMode) return;
    if (checkoutStep === "payment" || cart.length > 0) setSupervisorMode(false);
  }, [supervisorMode, checkoutStep, cart.length]);

  const clearCart = useCallback(() => {
    setCart([]);
    setCheckoutStep("cart");
    setSelectedLineId(null);
    setShowVatLine(false);
    setSupervisorMode(false);
  }, []);

  const cancelEntry = useCallback(() => {
    setCheckoutStep("cart");
    setSelectedLineId(null);
    setSupervisorMode(false);
  }, []);

  const holdOrder = useCallback(() => {
    if (cart.length === 0) return;
    const newHeld: PosHeldOrder = {
      id: crypto.randomUUID(),
      receiptId: newReceiptId(),
      label: `Hold ${heldOrders.length + 1}`,
      createdAt: Date.now(),
      lines: [...cart],
      showVatLine,
    };
    const next = [...heldOrders, newHeld];
    setHeldOrders(next);
    persistHeldOrders(next);
    setCart([]);
    setCheckoutStep("cart");
    setSelectedLineId(null);
    setShowVatLine(false);
  }, [cart, heldOrders, showVatLine]);

  const recallHeld = useCallback(
    (order: PosHeldOrder) => {
      if (cart.length > 0) {
        const ok = window.confirm(
          "Replace the current cart with this held order? Unsaved lines will be lost.",
        );
        if (!ok) return;
      }
      const newCart = cloneLines(order.lines);
      setCart(newCart);
      setHeldOrders((prev) => {
        const next = prev.filter((h) => h.id !== order.id);
        persistHeldOrders(next);
        return next;
      });
      setCheckoutStep("cart");
      setSelectedLineId(null);
      setShowVatLine(Boolean(order.showVatLine));
    },
    [cart.length],
  );

  const removeHeld = useCallback((id: string) => {
    setHeldOrders((prev) => {
      const next = prev.filter((h) => h.id !== id);
      persistHeldOrders(next);
      return next;
    });
  }, []);

  const goToPayment = useCallback(() => {
    if (cart.length === 0) return;
    if (billableCartLines(cart).length === 0) {
      posToast.info(
        "Nothing to charge yet",
        "Add products or delivery and tailor charges to the cart. Member card lines are not billed until points are enabled.",
      );
      return;
    }
    setCheckoutStep("payment");
  }, [cart]);

  const voidAll = useCallback(() => {
    clearCart();
  }, [clearCart]);

  const voidSelectedLine = useCallback(() => {
    if (!selectedLineId) return;
    setCart((prev) => prev.filter((l) => l.lineId !== selectedLineId));
    setSelectedLineId(null);
  }, [selectedLineId]);

  const triggerTotalAndPay = useCallback(() => {
    if (cart.length === 0) return;
    if (billableCartLines(cart).length === 0) {
      posToast.info(
        "Nothing to charge yet",
        "Add products or delivery and tailor charges to the cart. Member card lines are not billed until points are enabled.",
      );
      return;
    }
    setShowVatLine(true);
    setCheckoutStep("payment");
  }, [cart]);

  const applyLineDiscountPct = useCallback(
    (pct: number) => {
      if (!selectedLineId) return;
      const maxPct = maxDiscountPercentForRole(roleForDiscountPolicy);
      if (pct > maxPct + 1e-9) {
        posToast.warning(`Maximum discount: ${maxPct}%`);
        return;
      }
      const clamped = Math.max(0, Math.min(100, pct));
      setCart((prev) =>
        prev.map((l) =>
          l.lineId === selectedLineId ? { ...l, lineDiscountPct: clamped } : l,
        ),
      );
    },
    [selectedLineId, roleForDiscountPolicy],
  );

  const applyTotalDiscountPct = useCallback(
    (pct: number) => {
      const maxPct = maxDiscountPercentForRole(roleForDiscountPolicy);
      if (pct > maxPct + 1e-9) {
        posToast.warning(`Maximum discount: ${maxPct}%`);
        return;
      }
      const clamped = Math.max(0, Math.min(100, pct));
      const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      setDiscount(Number(((subtotal * clamped) / 100).toFixed(2)));
    },
    [cart, roleForDiscountPolicy],
  );

  const setLineComment = useCallback(
    (text: string) => {
      if (!selectedLineId) return;
      setCart((prev) =>
        prev.map((l) =>
          l.lineId === selectedLineId
            ? { ...l, comment: text.trim() || undefined }
            : l,
        ),
      );
    },
    [selectedLineId],
  );

  const completePayment = useCallback(
    async (
      paymentLabel: string,
      paymentMethodCode?: string,
      amountTendered?: number,
    ) => {
      if (cart.length === 0) return;
      const tenantSlug = currentUser?.tenantSlug ?? null;
      const billable = billableCartLines(cart);
      if (billable.length === 0) {
        posToast.info(
          "Nothing to sell",
          "Add billable products or delivery and tailor charges. Member card lines are excluded until points are enabled.",
        );
        return;
      }
      const {
        subtotal: s,
        tax: t,
        total: tot,
      } = cartTotals(billable, discount);

      const maxPct = maxDiscountPercentForRole(roleForDiscountPolicy);
      if (s > 0 && discount > 0 && discount / s > maxPct / 100 + 1e-9) {
        posToast.warning(
          "Discount too high for this sale",
          `This cart exceeds the ${maxPct}% limit for your role. Lower the discount or continue with a manager‑approved session.`,
        );
        return;
      }

      const tendered =
        amountTendered != null && Number.isFinite(amountTendered)
          ? amountTendered
          : tot;
      if (tendered + 1e-6 < tot) {
        posToast.error(
          "Insufficient tender",
          "The amount entered is less than the balance due. Enter the full payment amount.",
        );
        return;
      }

      if (tenantSlug) {
        if (!posSessionId) {
          posToast.warning(
            "No open shift",
            "Open a shift before recording sales.",
          );
          return;
        }
        const zeroPrice = billable.some(
          (l) => l.miscChargeKind == null && l.unitPrice <= 0,
        );
        if (zeroPrice) {
          posToast.warning(
            "Missing selling prices",
            "One or more items have no batch selling price. Update inventory or batch pricing before completing the sale.",
          );
          return;
        }
        const changeRounded =
          Math.round(Math.max(0, tendered - tot) * 100) / 100;
        const optimisticId = `opt-${Date.now()}`;
        const optimisticEntry: PosTransaction = {
          receiptId: newReceiptId(),
          saleId: optimisticId,
          createdAt: Date.now(),
          paymentMethod: paymentLabel,
          lines: cloneLines(billable),
          discount,
          subtotal: s,
          tax: t,
          total: tot,
          amountTendered: tendered,
          changeDue: changeRounded,
        };
        setTransactions((prev) => {
          const next = [optimisticEntry, ...prev].slice(0, 500);
          persistPosTransactions(next);
          return next;
        });
        try {
          const sale = await createSaleMutation.mutateAsync({
            tenantSlug,
            optimisticSaleId: optimisticId,
            optimisticReceiptId: optimisticEntry.receiptId,
            body: {
              totalAmount: tot,
              discount,
              tax: t,
              paymentMethod: paymentMethodCode ?? paymentLabel,
              posSessionId,
              items: billable.map((l) =>
                l.miscChargeKind === "delivery" || l.miscChargeKind === "tailor"
                  ? {
                      miscChargeKind: l.miscChargeKind,
                      quantity: l.qty,
                      price: l.unitPrice,
                    }
                  : {
                      productId: l.productId,
                      quantity: l.qty,
                      price: l.unitPrice,
                    },
              ),
            },
          });
          const receiptNum =
            (sale.receipt_number as string | null | undefined)?.trim() ||
            optimisticEntry.receiptId;
          const entry: PosTransaction = {
            receiptId: receiptNum,
            saleId: sale.id,
            createdAt: Date.now(),
            paymentMethod: paymentLabel,
            lines: cloneLines(billable),
            discount,
            subtotal: s,
            tax: t,
            total: tot,
            amountTendered: tendered,
            changeDue: changeRounded,
          };
          const changeDue = changeRounded;
          setTransactions((prev) => {
            const next = prev
              .map((row) => (row.saleId === optimisticId ? entry : row))
              .slice(0, 500);
            persistPosTransactions(next);
            return next;
          });
          clearCart();
          setReceiptToPrint(entry);
          posToast.success(
            "Sale recorded",
            [
              `Payment: ${paymentLabel}`,
              `Receipt #${entry.receiptId}`,
              `Transaction ${sale.id}`,
              changeDue > 0 ? `Change ${changeDue.toFixed(2)}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          );
        } catch (e) {
          setTransactions((prev) => {
            const next = prev.filter((row) => row.saleId !== optimisticId);
            persistPosTransactions(next);
            return next;
          });
          posToast.error(
            "Could not save sale",
            e instanceof Error
              ? e.message
              : "Check your connection and try again. The sale was not posted.",
          );
        }
        return;
      }

      const changeRounded = Math.round(Math.max(0, tendered - tot) * 100) / 100;
      const changeDue = changeRounded;
      const entry: PosTransaction = {
        receiptId: newReceiptId(),
        createdAt: Date.now(),
        paymentMethod: paymentLabel,
        lines: cloneLines(billable),
        discount,
        subtotal: s,
        tax: t,
        total: tot,
        amountTendered: tendered,
        changeDue: changeRounded,
      };
      setTransactions((prev) => {
        const next = [entry, ...prev].slice(0, 500);
        persistPosTransactions(next);
        return next;
      });
      clearCart();
      setReceiptToPrint(entry);
      posToast.success(
        "Sale saved locally",
        [
          `Payment: ${paymentLabel}`,
          `Receipt #${entry.receiptId}`,
          "Offline — sync when signed in",
          changeDue > 0 ? `Change ${changeDue.toFixed(2)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    },
    [
      cart,
      currentUser,
      discount,
      clearCart,
      roleForDiscountPolicy,
      posSessionId,
      createSaleMutation,
    ],
  );

  return (
    <PosContext.Provider
      value={{
        mainTab,
        setMainTab,
        checkoutStep,
        setCheckoutStep,
        transactions,
        setTransactions,
        currentUser,
        setCurrentUser,
        cart,
        setCart,
        discount,
        setDiscount,
        heldOrders,
        setHeldOrders,
        selectedLineId,
        setSelectedLineId,
        showVatLine,
        setShowVatLine,
        receiptToPrint,
        setReceiptToPrint,
        supervisorMode,
        setSupervisorMode,
        managerPrivilegesSuspended,
        setManagerPrivilegesSuspended,
        managerTierActiveForUi,
        clearCart,
        cancelEntry,
        holdOrder,
        recallHeld,
        removeHeld,
        goToPayment,
        voidAll,
        voidSelectedLine,
        triggerTotalAndPay,
        applyLineDiscountPct,
        applyTotalDiscountPct,
        setLineComment,
        completePayment,
        posSessionId,
        posSessionLoading,
        refreshPosSession,
        openPosShift,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const context = useContext(PosContext);
  if (context === undefined) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}
