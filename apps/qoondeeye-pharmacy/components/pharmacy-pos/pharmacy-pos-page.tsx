"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { PosReturnPanel } from "@/components/pos/pos-return-panel";
import type { PosTransaction } from "@/components/pos/pos-transaction-receipt";
import { clearAuthToken, getStoredUser } from "@/lib/auth-client";
import {
  createSale,
  getProductByBarcode,
  getSaleById,
  getSales,
  type Batch,
} from "@/lib/api";
import { useErpBatches } from "@/hooks/queries/use-erp-batches";
import { useErpCategories } from "@/hooks/queries/use-erp-categories";
import { useErpProducts } from "@/hooks/queries/use-erp-products";
import { createSaleSchema, validateForSubmit } from "@/lib/validation";
import { POS_DEFAULT_DISCOUNT } from "@repo/types";

import { ALL_CATEGORIES_LABEL, brand, nextUnitType } from "./pharmacy-pos-constants";
import { PharmacyPosFooter } from "./pharmacy-pos-footer";
import type { PosMainTab } from "./pharmacy-pos-toolbar";
import { PharmacyPosToolbar } from "./pharmacy-pos-toolbar";
import type { CartLine, HeldOrder, Product, UnitType } from "./pharmacy-pos-types";
import {
  billableCartLines,
  cartTotals,
  cloneLines,
  formatMoney,
  loadPosTransactions,
  newReceiptId,
  persistPosTransactions,
  resolvePosCatalogPricing,
  saleToPosTransaction,
  syncReceiptSeqFromTransactions,
} from "./pharmacy-pos-utils";
import { PosCartSidebar } from "./pos-cart-sidebar";
import { PosHeldOrdersPortal } from "./pos-held-orders-portal";
import { PosPinGate } from "./pos-pin-gate";
import { PosRegisterCatalog } from "./pos-register-catalog";
import {
  PosReceiptPrintPortal,
  PosReceiptSheet,
} from "./pos-receipt-sheet";
import { PosTransactionsPanel } from "./pos-transactions-panel";

function PosSessionGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<0 | 1 | 2>(0);

  const refresh = React.useCallback(() => {
    const u = getStoredUser();
    setSession(u?.userType === "tenant" && u.tenantSlug ? 2 : 1);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (session === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (session === 1) {
    return <PosPinGate onSuccess={refresh} />;
  }
  return <>{children}</>;
}

function PharmacyPosPageInner() {
  const router = useRouter();
  const tenantSlug = getStoredUser()?.tenantSlug ?? null;

  const productsQuery = useErpProducts(tenantSlug);
  const batchesQuery = useErpBatches(tenantSlug);
  const categoriesQuery = useErpCategories(tenantSlug);

  const [mainTab, setMainTab] = React.useState<PosMainTab>("register");
  const [categoryList, setCategoryList] = React.useState<string[]>([
    ALL_CATEGORIES_LABEL,
  ]);
  const [catalogProducts, setCatalogProducts] = React.useState<Product[]>([]);
  const [activeCategory, setActiveCategory] =
    React.useState<string>(ALL_CATEGORIES_LABEL);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [heldOrders, setHeldOrders] = React.useState<HeldOrder[]>([]);
  const [discount, setDiscount] = React.useState(POS_DEFAULT_DISCOUNT);
  const [checkoutStep, setCheckoutStep] = React.useState<"cart" | "payment">(
    "cart",
  );
  const [now, setNow] = React.useState(() => new Date());
  const [heldSheetOpen, setHeldSheetOpen] = React.useState(false);
  const selectMainTab = React.useCallback((tab: PosMainTab) => {
    if (tab !== "register") setHeldSheetOpen(false);
    setMainTab(tab);
  }, []);
  const [transactions, setTransactions] = React.useState<PosTransaction[]>([]);
  const [selectedReceipt, setSelectedReceipt] =
    React.useState<PosTransaction | null>(null);
  const [receiptToPrint, setReceiptToPrint] =
    React.useState<PosTransaction | null>(null);
  const [batchesState, setBatchesState] = React.useState<Batch[]>([]);
  const scanBufferRef = React.useRef("");
  const scanFlushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const productNameById = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of catalogProducts) out[p.id] = p.name;
    return out;
  }, [catalogProducts]);

  React.useEffect(() => {
    if (!heldSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHeldSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [heldSheetOpen]);

  React.useEffect(() => {
    syncReceiptSeqFromTransactions();
    setTransactions(loadPosTransactions());
  }, []);

  React.useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const sales = await getSales(tenantSlug);
        if (cancelled) return;
        const next = sales
          .map((sale) => saleToPosTransaction(sale, productNameById))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 500);
        setTransactions(next);
        persistPosTransactions(next);
        syncReceiptSeqFromTransactions();

        const missingLines = next
          .filter((tx) => tx.saleId && tx.lines.length === 0)
          .slice(0, 50);
        if (missingLines.length === 0 || cancelled) return;

        const hydratedBySaleId = new Map<string, PosTransaction>();
        await Promise.all(
          missingLines.map(async (tx) => {
            try {
              const sale = await getSaleById(tenantSlug, tx.saleId!);
              if (!sale) return;
              const hydrated = saleToPosTransaction(sale, productNameById);
              hydratedBySaleId.set(tx.saleId!, {
                ...tx,
                ...hydrated,
                paymentMethod: tx.paymentMethod || hydrated.paymentMethod,
              });
            } catch {
              // Ignore per-sale failures and continue hydrating others.
            }
          }),
        );
        if (cancelled || hydratedBySaleId.size === 0) return;

        setTransactions((prev) => {
          const patched = prev.map((tx) => {
            if (!tx.saleId) return tx;
            return hydratedBySaleId.get(tx.saleId) ?? tx;
          });
          persistPosTransactions(patched);
          return patched;
        });
      } catch {
        // Keep local cache if server history cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, productNameById]);

  React.useEffect(() => {
    if (catalogProducts.length === 0) return;
    setTransactions((prev) => {
      let changed = false;
      const next = prev.map((tx) => {
        let txChanged = false;
        const lines = tx.lines.map((line) => {
          const resolved = productNameById[line.productId];
          if (!resolved || line.name === resolved) return line;
          changed = true;
          txChanged = true;
          return { ...line, name: resolved };
        });
        return txChanged ? { ...tx, lines } : tx;
      });
      if (changed) persistPosTransactions(next);
      return changed ? next : prev;
    });
  }, [catalogProducts, productNameById]);

  React.useEffect(() => {
    if (!tenantSlug) {
      setCatalogProducts([]);
      setCategoryList([ALL_CATEGORIES_LABEL]);
      setBatchesState([]);
      return;
    }

    if (
      productsQuery.isError ||
      batchesQuery.isError ||
      categoriesQuery.isError
    ) {
      setCatalogProducts([]);
      setCategoryList([ALL_CATEGORIES_LABEL]);
      return;
    }

    const prods = productsQuery.data;
    const batchesData = batchesQuery.data;
    const cats = categoriesQuery.data;
    if (!prods || !batchesData || !cats) return;

    setBatchesState(batchesData);
    const catNames = new Map(cats.map((c) => [c.id, c.name]));
    const mapped: Product[] = prods.map((p) => {
      const { sellingValue, listValue, showCompare } = resolvePosCatalogPricing(
        p,
        batchesData,
        p.id,
      );
      return {
        id: p.id,
        sku: (p.sku ?? "").trim() || p.id.slice(0, 8),
        name: p.name,
        meta:
          [p.genericName, p.strength, p.unit].filter(Boolean).join(" • ") ||
          "Catalog item",
        category:
          (p.categoryId && catNames.get(p.categoryId)) || "Uncategorized",
        price: formatMoney(sellingValue),
        priceValue: sellingValue,
        listPriceValue: showCompare ? listValue : undefined,
        showCompare,
        stock: "in" as const,
        unitType: "PC" as UnitType,
      };
    });
    if (mapped.length > 0) {
      setCatalogProducts(mapped);
      const uc = [...new Set(mapped.map((m) => m.category))].sort();
      setCategoryList([ALL_CATEGORIES_LABEL, ...uc]);
    } else {
      setCatalogProducts([]);
      setCategoryList([ALL_CATEGORIES_LABEL]);
    }
  }, [
    tenantSlug,
    productsQuery.data,
    productsQuery.isError,
    batchesQuery.data,
    batchesQuery.isError,
    categoriesQuery.data,
    categoriesQuery.isError,
  ]);

  const addProductFromApi = React.useCallback(
    (p: {
      id: string;
      name: string;
      sku?: string | null;
      genericName?: string | null;
      strength?: string | null;
      unit?: string | null;
      listPrice?: number | string | null;
    }) => {
      const { sellingValue, listValue, showCompare } = resolvePosCatalogPricing(
        p,
        batchesState,
        p.id,
      );
      const mapped: Product = {
        id: p.id,
        sku: (p.sku ?? "").trim() || p.id.slice(0, 8),
        name: p.name,
        meta:
          [p.genericName, p.strength, p.unit].filter(Boolean).join(" • ") ||
          "Catalog item",
        category: "Scanned",
        price: formatMoney(sellingValue),
        priceValue: sellingValue,
        listPriceValue: showCompare ? listValue : undefined,
        showCompare,
        stock: sellingValue > 0 ? "in" : "low",
        unitType: "PC",
      };
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === mapped.id);
        if (existing) {
          return prev.map((l) =>
            l.productId === mapped.id ? { ...l, qty: l.qty + 1 } : l,
          );
        }
        return [
          ...prev,
          {
            lineId: crypto.randomUUID(),
            productId: mapped.id,
            name: mapped.name,
            unitPrice: mapped.priceValue,
            listUnitPrice:
              mapped.showCompare && mapped.listPriceValue != null
                ? mapped.listPriceValue
                : undefined,
            qty: 1,
            unitType: mapped.unitType,
          },
        ];
      });
    },
    [batchesState],
  );

  const resolveBarcodeScan = React.useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !tenantSlug) return;
      try {
        const p = await getProductByBarcode(tenantSlug, code);
        addProductFromApi(p);
        setSearchQuery("");
      } catch {
        /* not found: keep query when resolving from search box */
      }
    },
    [tenantSlug, addProductFromApi],
  );

  const tryBarcodeScan = React.useCallback(async () => {
    await resolveBarcodeScan(searchQuery);
  }, [searchQuery, resolveBarcodeScan]);

  React.useEffect(() => {
    if (mainTab !== "register") {
      scanBufferRef.current = "";
      return;
    }

    const flushStaleBuffer = () => {
      if (scanFlushTimerRef.current) clearTimeout(scanFlushTimerRef.current);
      scanFlushTimerRef.current = setTimeout(() => {
        scanBufferRef.current = "";
      }, 400);
    };

    const ignoreTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.closest('[role="dialog"]')) return true;
      if (el.closest("[data-radix-sheet-content]")) return true;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (ignoreTarget(e.target)) return;

      if (e.key === "Enter") {
        const buf = scanBufferRef.current.trim();
        scanBufferRef.current = "";
        if (scanFlushTimerRef.current) {
          clearTimeout(scanFlushTimerRef.current);
          scanFlushTimerRef.current = null;
        }
        if (buf.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          void resolveBarcodeScan(buf);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (/^[0-9A-Za-z\-./]$/.test(e.key)) {
          scanBufferRef.current += e.key;
          if (scanBufferRef.current.length > 64) {
            scanBufferRef.current = scanBufferRef.current.slice(-64);
          }
          e.preventDefault();
          e.stopPropagation();
          flushStaleBuffer();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      scanBufferRef.current = "";
      if (scanFlushTimerRef.current) clearTimeout(scanFlushTimerRef.current);
    };
  }, [mainTab, resolveBarcodeScan]);

  React.useEffect(() => {
    if (mainTab !== "register") return;
    const id = requestAnimationFrame(() => {
      document
        .getElementById("pos-barcode-search")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [mainTab]);

  React.useEffect(() => {
    if (!categoryList.includes(activeCategory)) {
      setActiveCategory(categoryList[0] ?? ALL_CATEGORIES_LABEL);
    }
  }, [categoryList, activeCategory]);

  React.useEffect(() => {
    if (!receiptToPrint) return;
    document.body.classList.add("printing-pos-receipt");
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [receiptToPrint]);

  React.useEffect(() => {
    const onAfterPrint = () => {
      document.body.classList.remove("printing-pos-receipt");
      setReceiptToPrint(null);
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { subtotal, tax, total } = cartTotals(
    billableCartLines(cart),
    discount,
  );

  const filteredProducts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const src = catalogProducts;
    const byCategory =
      q.length > 0
        ? src
        : activeCategory === ALL_CATEGORIES_LABEL
          ? src
          : src.filter((p) => p.category === activeCategory);
    if (!q) return byCategory;
    return byCategory.filter((p) => {
      const hay = `${p.name} ${p.sku} ${p.meta} ${p.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activeCategory, searchQuery, catalogProducts]);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: p.id,
          name: p.name,
          unitPrice: p.priceValue,
          listUnitPrice:
            p.showCompare && p.listPriceValue != null
              ? p.listPriceValue
              : undefined,
          qty: 1,
          unitType: p.unitType,
        },
      ];
    });
  };

  const setQty = (lineId: string, qty: number) => {
    if (qty < 1) {
      setCart((prev) => prev.filter((l) => l.lineId !== lineId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
    );
  };

  const clearCart = () => {
    setCart([]);
    setCheckoutStep("cart");
  };

  const holdOrder = () => {
    if (cart.length === 0) return;
    setHeldOrders((prev) => {
      const label = `Hold ${prev.length + 1}`;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          label,
          createdAt: Date.now(),
          lines: cloneLines(cart),
        },
      ];
    });
    setCart([]);
    setCheckoutStep("cart");
  };

  const recallHeld = (order: HeldOrder) => {
    if (cart.length > 0) {
      const ok = window.confirm(
        "Replace the current cart with this held order? Unsaved lines will be lost.",
      );
      if (!ok) return;
    }
    setCart(cloneLines(order.lines));
    setHeldOrders((prev) => prev.filter((h) => h.id !== order.id));
    setCheckoutStep("cart");
    setHeldSheetOpen(false);
  };

  const removeHeld = (id: string) => {
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
  };

  const goToPayment = () => {
    if (cart.length === 0) return;
    if (billableCartLines(cart).length === 0) {
      window.alert(
        "Add products or delivery/tailor charges. Member card is not included until points are enabled.",
      );
      return;
    }
    setCheckoutStep("payment");
  };

  const completePayment = async (
    paymentLabel: string,
    paymentMethodCode?: string,
  ) => {
    if (cart.length === 0) return;
    const billable = billableCartLines(cart);
    if (billable.length === 0) {
      window.alert(
        "Add products or delivery/tailor charges. Member card is not included until points are enabled.",
      );
      return;
    }
    const { subtotal: s, tax: t, total: tot } = cartTotals(billable, discount);

    if (tenantSlug) {
      const zeroPrice = billable.some(
        (l) => l.miscChargeKind == null && l.unitPrice <= 0,
      );
      if (zeroPrice) {
        window.alert(
          "One or more lines have no price (no batch selling price). Set prices in inventory or batches before completing the sale.",
        );
        return;
      }
      try {
        const saleBody = {
          totalAmount: tot,
          discount,
          tax: t,
          paymentMethod: paymentMethodCode ?? paymentLabel,
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
        };
        const validated = validateForSubmit(createSaleSchema, saleBody);
        if (!validated.ok) {
          window.alert(validated.message);
          return;
        }
        const sale = await createSale(tenantSlug, validated.data);
        const receiptNum =
          (sale.receipt_number as string | null | undefined)?.trim() ||
          newReceiptId();
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
      lines: cloneLines(billable),
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
  };

  const openTransactionReceipt = React.useCallback(
    async (tx: PosTransaction) => {
      setSelectedReceipt(tx);
      if (!tenantSlug || !tx.saleId || tx.lines.length > 0) return;
      try {
        const sale = await getSaleById(tenantSlug, tx.saleId);
        if (!sale) return;
        const hydrated = saleToPosTransaction(sale, productNameById);
        const merged: PosTransaction = {
          ...tx,
          ...hydrated,
          paymentMethod: tx.paymentMethod || hydrated.paymentMethod,
        };
        setTransactions((prev) => {
          const next = prev.map((row) =>
            row.saleId === tx.saleId ? merged : row,
          );
          persistPosTransactions(next);
          return next;
        });
        setSelectedReceipt(merged);
      } catch {
        // Keep the existing transaction if hydration fails.
      }
    },
    [tenantSlug, productNameById],
  );

  const formattedFooter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  const handleLogout = React.useCallback(() => {
    clearAuthToken();
    try {
      localStorage.removeItem("branchId");
    } catch {
      /* ignore */
    }
    router.push("/login");
  }, [router]);

  return (
    <div
      className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#f6f8f8] font-sans text-slate-900 dark:bg-[#102220] dark:text-slate-100"
      style={{ ["--pos-brand" as string]: brand }}
    >
      <main className="flex min-h-0 flex-1 gap-6 overflow-hidden p-6 pt-6">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <PharmacyPosToolbar
            mainTab={mainTab}
            onSelectTab={selectMainTab}
            transactionsCount={transactions.length}
          />

          {mainTab === "transactions" ? (
            <PosTransactionsPanel
              transactions={transactions}
              onOpenTransaction={openTransactionReceipt}
            />
          ) : null}

          {mainTab === "returns" ? (
            <PosReturnPanel tenantSlug={tenantSlug} brandColor={brand} />
          ) : null}

          {mainTab === "register" ? (
            <PosRegisterCatalog
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchEnter={() => void tryBarcodeScan()}
              categoryList={categoryList}
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              filteredProducts={filteredProducts}
              onAddProduct={addProduct}
            />
          ) : null}
        </div>

        {mainTab === "register" ? (
          <PosCartSidebar
            checkoutStep={checkoutStep}
            cart={cart}
            discount={discount}
            subtotal={subtotal}
            tax={tax}
            total={total}
            heldOrdersCount={heldOrders.length}
            heldSheetOpen={heldSheetOpen}
            onClearCart={clearCart}
            onHoldOrder={holdOrder}
            onOpenHeldSheet={() => setHeldSheetOpen(true)}
            onSetQty={setQty}
            onCycleUnit={(lineId) => {
              setCart((prev) =>
                prev.map((l) =>
                  l.lineId === lineId
                    ? { ...l, unitType: nextUnitType(l.unitType) }
                    : l,
                ),
              );
            }}
            onEditDiscount={() => {
              const v = window.prompt(
                "Discount amount (USD)",
                String(discount),
              );
              if (v == null) return;
              const n = Number.parseFloat(v);
              if (Number.isFinite(n) && n >= 0) setDiscount(n);
            }}
            onGoToPayment={goToPayment}
            onBackToCart={() => setCheckoutStep("cart")}
            onCompletePayment={completePayment}
          />
        ) : null}

        <PosReceiptSheet
          selectedReceipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          onPrintReceipt={(tx) => setReceiptToPrint(tx)}
        />

        <PosReceiptPrintPortal transaction={receiptToPrint} />

        <PosHeldOrdersPortal
          open={heldSheetOpen}
          heldOrders={heldOrders}
          onClose={() => setHeldSheetOpen(false)}
          onRecall={recallHeld}
          onRemove={removeHeld}
        />
      </main>

      <PharmacyPosFooter
        formattedFooter={formattedFooter}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default function PharmacyPosPage() {
  return (
    <PosSessionGate>
      <PharmacyPosPageInner />
    </PosSessionGate>
  );
}
