"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { PosTransaction, PosCartLine, PosHeldOrder } from "@repo/types";
import { getStoredUser, type StoredUser } from "@/lib/auth-client";
import {
  loadPosTransactions,
  loadHeldOrders,
  persistHeldOrders,
  persistPosTransactions,
  cloneLines,
  newReceiptId,
} from "@/lib/pos-utils";
import { createSale } from "@/lib/api";
import { cartTotals } from "@/features/register/model/totals";

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
  ) => Promise<void>;
};

const PosContext = createContext<PosContextType | undefined>(undefined);

export function PosProvider({ children }: { children: React.ReactNode }) {
  const [mainTab, setMainTab] = useState<"register" | "returns">("register");
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "payment">("cart");
  const [transactions, setTransactions] = useState<PosTransaction[]>([]);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [heldOrders, setHeldOrders] = useState<PosHeldOrder[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [showVatLine, setShowVatLine] = useState(false);
  const [receiptToPrint, setReceiptToPrint] = useState<PosTransaction | null>(
    null,
  );
  const [supervisorMode, setSupervisorMode] = useState(false);

  useEffect(() => {
    setTransactions(loadPosTransactions());
    setHeldOrders(loadHeldOrders());
    setCurrentUser(getStoredUser());
  }, []);

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
    setCheckoutStep("payment");
  }, [cart.length]);

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
    setShowVatLine(true);
    setCheckoutStep("payment");
  }, [cart.length]);

  const applyLineDiscountPct = useCallback(
    (pct: number) => {
      if (!selectedLineId) return;
      const clamped = Math.max(0, Math.min(100, pct));
      setCart((prev) =>
        prev.map((l) =>
          l.lineId === selectedLineId ? { ...l, lineDiscountPct: clamped } : l,
        ),
      );
    },
    [selectedLineId],
  );

  const applyTotalDiscountPct = useCallback(
    (pct: number) => {
      const clamped = Math.max(0, Math.min(100, pct));
      const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      setDiscount(Number(((subtotal * clamped) / 100).toFixed(2)));
    },
    [cart],
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
    async (paymentLabel: string, paymentMethodCode?: string) => {
      if (cart.length === 0) return;
      const tenantSlug = currentUser?.tenantSlug ?? null;
      const { subtotal: s, tax: t, total: tot } = cartTotals(cart, discount);

      if (tenantSlug) {
        const zeroPrice = cart.some((l) => l.unitPrice <= 0);
        if (zeroPrice) {
          window.alert(
            "One or more lines have no price (no batch selling price). Set prices in inventory or batches before completing the sale.",
          );
          return;
        }
        try {
          const sale = await createSale(tenantSlug, {
            totalAmount: tot,
            discount,
            tax: t,
            paymentMethod: paymentMethodCode ?? paymentLabel,
            items: cart.map((l) => ({
              productId: l.productId,
              quantity: l.qty,
              price: l.unitPrice,
            })),
          });
          const receiptNum =
            (sale.receipt_number as string | null | undefined)?.trim() ||
            newReceiptId();
          const entry: PosTransaction = {
            receiptId: receiptNum,
            saleId: sale.id,
            createdAt: Date.now(),
            paymentMethod: paymentLabel,
            lines: cloneLines(cart),
            discount,
            subtotal: s,
            tax: t,
            total: tot,
          };
          setTransactions((prev) => {
            const next = [entry, ...prev].slice(0, 500);
            persistPosTransactions(next);
            return next;
          });
          clearCart();
          setReceiptToPrint(entry);
          window.alert(
            `Sale completed (${paymentLabel}).\nReceipt #: ${entry.receiptId}\nTransaction ID: ${sale.id}`,
          );
        } catch (e) {
          window.alert(
            e instanceof Error ? e.message : "Could not save sale to server.",
          );
        }
        return;
      }

      const entry: PosTransaction = {
        receiptId: newReceiptId(),
        createdAt: Date.now(),
        paymentMethod: paymentLabel,
        lines: cloneLines(cart),
        discount,
        subtotal: s,
        tax: t,
        total: tot,
      };
      setTransactions((prev) => {
        const next = [entry, ...prev].slice(0, 500);
        persistPosTransactions(next);
        return next;
      });
      clearCart();
      setReceiptToPrint(entry);
      window.alert(
        `Sale completed (${paymentLabel}).\nReceipt #: ${entry.receiptId} (offline — sign in with tenant to sync).`,
      );
    },
    [cart, currentUser, discount, clearCart],
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
