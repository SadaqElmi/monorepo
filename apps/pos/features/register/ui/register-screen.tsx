"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, ChevronDown, ChevronUp, Undo2 } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PosReturnPanel } from "@/components/pos/pos-return-panel";
import { PosTransactionReceipt } from "@/components/pos/pos-transaction-receipt";
import type { PosTransaction, UnitType } from "@repo/types";
import { usePos } from "@/components/pos-context";
import {
  getBatches,
  getCategories,
  getSaleById,
  getSales,
  getProductByBarcode,
  getProducts,
  type Batch,
} from "@/lib/api";
import {
  persistPosTransactions,
  syncReceiptSeqFromTransactions,
} from "@/lib/pos-utils";

import {
  ALL_CATEGORIES_LABEL,
  DEFAULT_DISCOUNT,
  POS_BRAND_COLOR,
  UNIT_TYPES,
} from "../model/constants";
import { resolvePosCatalogPricing } from "../model/pricing";
import { cartTotals } from "../model/totals";
import { saleToPosTransaction } from "../model/transactions";
import type { PosCatalogProduct } from "../model/types";
import { formatMoney } from "@/shared/lib";

export function RegisterScreen() {
  const router = useRouter();
  const {
    mainTab,
    checkoutStep,
    setCheckoutStep,
    setTransactions,
    currentUser,
    cart,
    setCart,
    discount,
    setDiscount,
    selectedLineId,
    setSelectedLineId,
    showVatLine,
    receiptToPrint,
    setReceiptToPrint,
    clearCart: contextClearCart,
    cancelEntry,
    holdOrder: contextHoldOrder,
    goToPayment: contextGoToPayment,
  } = usePos();

  const [isTotalDialogOpen, setIsTotalDialogOpen] = React.useState(false);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = React.useState(false);

  const tenantSlug = currentUser?.tenantSlug ?? null;

  const [categoryList, setCategoryList] = React.useState<string[]>([
    ALL_CATEGORIES_LABEL,
  ]);
  const [catalogProducts, setCatalogProducts] = React.useState<
    PosCatalogProduct[]
  >([]);
  const [activeCategory, setActiveCategory] =
    React.useState<string>(ALL_CATEGORIES_LABEL);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isProductMenuOpen, setIsProductMenuOpen] = React.useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] =
    React.useState(0);
  const [, setNow] = React.useState<Date | null>(null);
  const [batchesState, setBatchesState] = React.useState<Batch[]>([]);
  const searchMenuCloseTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const scanBufferRef = React.useRef("");
  const scanFlushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [forceBlankSelectionPanel, setForceBlankSelectionPanel] =
    React.useState(false);

  React.useEffect(() => {
    if (cart.length === 0) setForceBlankSelectionPanel(false);
  }, [cart.length]);

  React.useEffect(() => {
    if (selectedLineId) setForceBlankSelectionPanel(false);
  }, [selectedLineId]);

  const productNameById = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of catalogProducts) out[p.id] = p.name;
    return out;
  }, [catalogProducts]);

  React.useEffect(() => {
    syncReceiptSeqFromTransactions();
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
  }, [tenantSlug, productNameById, setTransactions]);

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
  }, [catalogProducts, productNameById, setTransactions]);

  React.useEffect(() => {
    if (!tenantSlug) {
      setCatalogProducts([]);
      setCategoryList([ALL_CATEGORIES_LABEL]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [prods, batchesData, cats] = await Promise.all([
          getProducts(tenantSlug),
          getBatches(tenantSlug),
          getCategories(tenantSlug),
        ]);
        if (cancelled) return;
        setBatchesState(batchesData);
        const catNames = new Map(cats.map((c) => [c.id, c.name]));
        const mapped: PosCatalogProduct[] = prods.map((p) => {
          const { sellingValue, listValue, showCompare } =
            resolvePosCatalogPricing(p, batchesData, p.id);
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
      } catch {
        if (!cancelled) {
          setCatalogProducts([]);
          setCategoryList([ALL_CATEGORIES_LABEL]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

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
      const mapped: PosCatalogProduct = {
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
    [batchesState, setCart],
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

  /** Capture wedge-scanner input when focus is not in a text field. */
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
      // Ignore keystrokes when interacting with Radix/shadcn overlays.
      // (Dialog, Sheet, Popover, DropdownMenu, Select, Tooltip, etc.)
      if (el.closest('[role="dialog"]')) return true;
      if (el.closest("[data-radix-popper-content-wrapper]")) return true;
      if (el.closest("[data-radix-portal]")) return true;
      if (el.closest("[data-radix-menu-content]")) return true;
      if (el.closest("[data-radix-select-content]")) return true;
      if (el.closest("[data-radix-dropdown-menu-content]")) return true;
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

  /** Keep the search/barcode field focused on Register. */
  React.useEffect(() => {
    if (mainTab !== "register") return;
    const id = requestAnimationFrame(() => {
      document
        .getElementById("pos-catalog-search")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [mainTab]);

  React.useEffect(() => {
    setHighlightedProductIndex(0);
  }, [searchQuery]);

  React.useEffect(() => {
    return () => {
      if (searchMenuCloseTimerRef.current) {
        clearTimeout(searchMenuCloseTimerRef.current);
      }
    };
  }, []);

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
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { subtotal, tax, total } = cartTotals(cart, discount);

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

  const productSuggestions = React.useMemo(
    () => filteredProducts.slice(0, 8),
    [filteredProducts],
  );

  React.useEffect(() => {
    if (mainTab !== "register") {
      setIsProductMenuOpen(false);
      return;
    }
    if (searchQuery.trim().length === 0 || filteredProducts.length === 0) {
      setIsProductMenuOpen(false);
      return;
    }
    setIsProductMenuOpen(true);
  }, [mainTab, searchQuery, filteredProducts.length]);

  const addProduct = (p: PosCatalogProduct) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        setSelectedLineId(existing.lineId);
        return prev.map((l) =>
          l.productId === p.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      const newLineId = crypto.randomUUID();
      setSelectedLineId(newLineId);
      return [
        ...prev,
        {
          lineId: newLineId,
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

  const cycleUnitType = (lineId: string) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId) return l;
        const currentIndex = UNIT_TYPES.indexOf(l.unitType);
        const nextIndex = (currentIndex + 1) % UNIT_TYPES.length;
        return { ...l, unitType: UNIT_TYPES[nextIndex]! };
      }),
    );
  };

  const selectSuggestedProduct = (p: PosCatalogProduct) => {
    addProduct(p);
    setSearchQuery("");
    setHighlightedProductIndex(0);
    setIsProductMenuOpen(false);
  };

  const clearCart = contextClearCart;
  const holdOrder = contextHoldOrder;

  const handleSuspendClick = () => {
    if (cart.length === 0) {
      router.push("/suspended");
      return;
    }
    setIsSuspendDialogOpen(true);
  };

  const confirmSuspendOrder = () => {
    holdOrder();
    setIsSuspendDialogOpen(false);
  };

  const goToPayment = () => {
    contextGoToPayment();
  };

  const navigateSelection = React.useCallback(
    (direction: "up" | "down") => {
      if (cart.length === 0) return;
      const currentIndex = cart.findIndex((l) => l.lineId === selectedLineId);
      let nextIndex = currentIndex;
      if (direction === "up") {
        nextIndex = currentIndex <= 0 ? cart.length - 1 : currentIndex - 1;
      } else {
        nextIndex = currentIndex >= cart.length - 1 ? 0 : currentIndex + 1;
      }
      setSelectedLineId(cart[nextIndex]?.lineId ?? null);
    },
    [cart, selectedLineId],
  );

  const handleNumpadKey = React.useCallback(
    (key: string) => {
      if (key === "⌫") {
        setSearchQuery((prev) => prev.slice(0, -1));
        return;
      }
      if (key === "CLR") {
        setSearchQuery("");
        return;
      }
      if (key === "QTY" || key === "QT") {
        setSearchQuery((prev) => (prev.length > 0 ? `${prev}*` : prev));
        return;
      }
      if (key === "UP") {
        navigateSelection("up");
        return;
      }
      if (key === "DOWN") {
        navigateSelection("down");
        return;
      }
      setSearchQuery((prev) => `${prev}${key}`);
    },
    [navigateSelection],
  );

  return (
    <div
      className="flex flex-1 min-h-0 flex-col bg-[#f6f8f8] font-sans text-slate-900 dark:bg-[#0a1514] dark:text-slate-100"
      style={{ ["--pos-brand" as string]: POS_BRAND_COLOR }}
    >
      <header className="border-b border-slate-500/30 bg-[#d9d9d9]">
        <div className="flex h-14 w-full items-stretch">
          <div className="flex w-[260px] items-center border-r border-slate-500/30 px-4">
            <p className="text-[34px] font-bold leading-none text-[#111]">
              Item no:
            </p>
          </div>
          <div className="relative flex flex-1 items-center bg-[#1f3133] px-3">
            <Input
              id="pos-catalog-search"
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim().length > 0)
                  setIsProductMenuOpen(true);
              }}
              onKeyDown={(e) => {
                if (
                  isProductMenuOpen &&
                  productSuggestions.length > 0 &&
                  e.key === "ArrowDown"
                ) {
                  e.preventDefault();
                  setHighlightedProductIndex((prev) =>
                    Math.min(prev + 1, productSuggestions.length - 1),
                  );
                  return;
                }
                if (
                  isProductMenuOpen &&
                  productSuggestions.length > 0 &&
                  e.key === "ArrowUp"
                ) {
                  e.preventDefault();
                  setHighlightedProductIndex((prev) => Math.max(prev - 1, 0));
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (isProductMenuOpen && productSuggestions.length > 0) {
                    const picked =
                      productSuggestions[highlightedProductIndex] ??
                      productSuggestions[0];
                    if (picked) {
                      selectSuggestedProduct(picked);
                      return;
                    }
                  }
                  void tryBarcodeScan();
                  setIsProductMenuOpen(false);
                }
                if (e.key === "Escape") setIsProductMenuOpen(false);
              }}
              placeholder=""
              autoComplete="off"
              autoFocus
              onFocus={() => {
                if (searchMenuCloseTimerRef.current) {
                  clearTimeout(searchMenuCloseTimerRef.current);
                  searchMenuCloseTimerRef.current = null;
                }
                if (
                  searchQuery.trim().length > 0 &&
                  productSuggestions.length > 0
                ) {
                  setIsProductMenuOpen(true);
                }
              }}
              onBlur={() => {
                searchMenuCloseTimerRef.current = setTimeout(() => {
                  setIsProductMenuOpen(false);
                }, 120);
              }}
              className="h-10 w-full border-0 bg-transparent pr-12 text-2xl font-semibold text-white shadow-none focus-visible:ring-0"
            />
            {isProductMenuOpen && productSuggestions.length > 0 ? (
              <div className="absolute left-2 right-12 top-full z-30 mt-1 overflow-hidden rounded-md border border-[#3c5556] bg-[#223739] shadow-2xl">
                {productSuggestions.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[#324749] px-3 py-2 text-left last:border-b-0",
                      idx === highlightedProductIndex
                        ? "bg-[#335255] text-white"
                        : "text-slate-100 hover:bg-[#2c4749]",
                    )}
                    onMouseEnter={() => setHighlightedProductIndex(idx)}
                    onClick={() => selectSuggestedProduct(p)}
                  >
                    <span className="truncate text-sm font-semibold">
                      {p.sku} {p.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-[#6f8b8a] bg-[#294043] text-[#b8d3d2] hover:bg-[#335255]"
              aria-label="Open calculator"
              onClick={() => console.log("Open calculator")}
            >
              <Calculator className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden",
          mainTab === "register"
            ? "gap-0 p-0"
            : "gap-5 p-5 pt-5 sm:gap-6 sm:p-6 sm:pt-6",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            mainTab === "register"
              ? "border-r border-(--pos-brand)/15 bg-white dark:bg-[#122a27]/40"
              : "gap-4",
          )}
        >
          {mainTab === "returns" ? (
            <PosReturnPanel
              tenantSlug={tenantSlug}
              brandColor={POS_BRAND_COLOR}
            />
          ) : null}

          {mainTab === "register" ? (
            <>
              <CardContent className="m-3 mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl  bg-white p-3 dark:bg-[#122a27]">
                <div className="grid grid-cols-[2.8fr_0.5fr_0.6fr_1fr_0.9fr_1fr_1fr] bg-slate-700 text-[13px] font-bold text-white dark:bg-slate-800">
                  <div className="border-r border-white/20 px-3 py-2">
                    Description
                  </div>
                  <div className="border-r border-white/20 px-3 py-2">Unit</div>
                  <div className="border-r border-white/20 px-2 py-2 text-right">
                    Qty
                  </div>
                  <div className="border-r border-white/20 px-2 py-2 text-right">
                    Price
                  </div>
                  <div className="border-r border-white/20 px-2 py-2 text-right">
                    Disc%
                  </div>
                  <div className="border-r border-white/20 px-2 py-2 text-right">
                    Discount
                  </div>
                  <div className="px-3 py-2 text-right">Amount</div>
                </div>
                {cart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Scan or enter a barcode from the keypad to add items to the
                    current order.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
                    {showVatLine ? (
                      <div className="grid grid-cols-[2.8fr_0.5fr_0.6fr_1fr_0.9fr_1fr_1fr] bg-amber-100 text-sm font-bold text-slate-900 dark:bg-amber-900/40 dark:text-amber-100">
                        <div className="border-r border-amber-300 px-3 py-2 dark:border-amber-700">
                          <div className="truncate text-base font-bold">
                            VAT 5%
                          </div>
                        </div>
                        <div className="border-r border-amber-300 px-3 py-2 dark:border-amber-700">
                          —
                        </div>
                        <div className="border-r border-amber-300 px-2 py-2 text-right dark:border-amber-700">
                          1
                        </div>
                        <div className="border-r border-amber-300 px-2 py-2 text-right tabular-nums dark:border-amber-700">
                          0.05
                        </div>
                        <div className="border-r border-amber-300 px-2 py-2 text-right tabular-nums dark:border-amber-700">
                          0
                        </div>
                        <div className="border-r border-amber-300 px-2 py-2 text-right tabular-nums dark:border-amber-700">
                          {formatMoney(0)}
                        </div>
                        <div className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(tax)}
                        </div>
                      </div>
                    ) : null}
                    {cart.map((item, index) => {
                      const lineSubtotal = item.unitPrice * item.qty;
                      const explicitLinePct =
                        typeof item.lineDiscountPct === "number"
                          ? item.lineDiscountPct
                          : undefined;
                      const allocatedDiscount =
                        explicitLinePct != null
                          ? (lineSubtotal * explicitLinePct) / 100
                          : subtotal > 0
                            ? (lineSubtotal / subtotal) * discount
                            : 0;
                      const discountedLinePrice =
                        lineSubtotal - allocatedDiscount;
                      const lineDiscPct =
                        explicitLinePct != null
                          ? Math.round(explicitLinePct)
                          : lineSubtotal > 0
                            ? Math.round(
                                (allocatedDiscount / lineSubtotal) * 100,
                              )
                            : 0;

                      return (
                        <div
                          key={item.lineId}
                          onClick={() => setSelectedLineId(item.lineId)}
                          className={cn(
                            "cursor-pointer grid grid-cols-[2.8fr_0.5fr_0.6fr_1fr_0.9fr_1fr_1fr] text-sm font-bold text-slate-900 dark:text-slate-100 transition-colors",
                            item.lineId === selectedLineId
                              ? "bg-(--pos-brand)/20 dark:bg-(--pos-brand)/30 ring-1 ring-inset ring-(--pos-brand)"
                              : index % 2 === 0
                                ? "bg-slate-100 dark:bg-slate-900/40 hover:bg-slate-200/80 dark:hover:bg-slate-800/80"
                                : "bg-slate-200 dark:bg-slate-900/70 hover:bg-slate-300/80 dark:hover:bg-slate-800/80",
                          )}
                        >
                          <div className="border-r border-slate-300 px-3 py-2 dark:border-slate-700">
                            <div className="truncate text-base font-bold">
                              {item.name}
                            </div>
                          </div>
                          <div
                            className="border-r border-slate-300 px-3 py-2 dark:border-slate-700 hover:bg-slate-400/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              cycleUnitType(item.lineId);
                            }}
                          >
                            {item.unitType}
                          </div>
                          <div className="border-r border-slate-300 px-2 py-2 text-right dark:border-slate-700">
                            {item.qty}
                          </div>
                          <div className="border-r border-slate-300 px-2 py-2 text-right tabular-nums dark:border-slate-700">
                            {formatMoney(item.unitPrice)}
                          </div>
                          <div className="border-r border-slate-300 px-2 py-2 text-right tabular-nums dark:border-slate-700">
                            {lineDiscPct}
                          </div>
                          <div className="border-r border-slate-300 px-2 py-2 text-right tabular-nums dark:border-slate-700">
                            {formatMoney(allocatedDiscount)}
                          </div>
                          <div className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(discountedLinePrice)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              <div className="mt-3 overflow-hidden rounded-md border border-gray-300 bg-white">
                <button
                  type="button"
                  className="flex w-full items-stretch"
                  onClick={() => setIsTotalDialogOpen(true)}
                >
                  <div className="flex h-16 w-1/2 items-center justify-center bg-[#7faea4] text-black font-semibold text-lg">
                    Total
                  </div>
                  <div className="flex h-16 w-1/2 items-center justify-center bg-gray-100 text-black font-semibold text-lg tabular-nums">
                    {formatMoney(total)}
                  </div>
                </button>
              </div>

              <Dialog
                open={isTotalDialogOpen}
                onOpenChange={setIsTotalDialogOpen}
              >
                <DialogContent
                  showCloseButton={false}
                  className="w-[420px] max-w-sm gap-0 overflow-hidden border-slate-600 bg-slate-800 p-0 text-white"
                >
                  <div className="divide-y divide-slate-600">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-medium">Total</span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(total)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-medium">Discount</span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(discount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-white px-4 py-3 font-bold text-black">
                      <span>Vat Amount</span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(tax)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-medium">Payment</span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-medium">Balance</span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(total)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-600">
                    <Button
                      type="button"
                      className="h-12 w-full rounded-none bg-rose-500 font-bold text-slate-950 hover:bg-rose-400"
                      onClick={() => setIsTotalDialogOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isSuspendDialogOpen}
                onOpenChange={setIsSuspendDialogOpen}
              >
                <DialogContent showCloseButton={false} className="w-[420px]">
                  <DialogHeader>
                    <DialogTitle>Suspend order?</DialogTitle>
                    <DialogDescription>
                      This will move the current cart to held orders.
                    </DialogDescription>
                  </DialogHeader>

                  <DialogFooter className="gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsSuspendDialogOpen(false)}
                    >
                      No
                    </Button>
                    <Button type="button" onClick={confirmSuspendOrder}>
                      Yes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>

        {mainTab === "register" ? (
          <>
            <Card className="flex w-[15%] min-w-[430px] shrink-0 flex-col gap-0 overflow-hidden rounded-none border-0 shadow-none bg-slate-900">
              <div className="flex  flex-col">
                <div className="flex-1 space-y-2 p-4 ">
                  <div className="min-h-16 rounded-md bg-slate-800 px-4 py-3">
                    {cart.length === 0 ? (
                      <p className="text-sm font-semibold text-slate-300">
                        No item selected
                      </p>
                    ) : checkoutStep === "payment" ? (
                      <div className="flex items-center h-full ">
                        <p className="text-sm font-semibold text-slate-300">
                          Payment
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center h-full ">
                        {(() => {
                          const activeItem = selectedLineId
                            ? cart.find((l) => l.lineId === selectedLineId)
                            : forceBlankSelectionPanel
                              ? undefined
                              : cart[cart.length - 1];
                          return activeItem ? (
                            <div className="w-full flex items-start justify-between gap-3 text-lg font-bold text-white">
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 leading-tight">
                                  {activeItem.name}
                                </p>
                                {activeItem.comment ? (
                                  <p className="mt-1 line-clamp-2 text-xs font-semibold italic text-slate-300">
                                    {activeItem.comment}
                                  </p>
                                ) : null}
                              </div>
                              <p className="shrink-0 tabular-nums">
                                x{activeItem.qty}
                              </p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 ">
                    <div className="flex h-10 items-center justify-between rounded-md bg-slate-800 px-4">
                      {checkoutStep === "payment" ? (
                        <>
                          <p className="text-xs font-extrabold uppercase tracking-tight text-slate-300">
                            Balance
                          </p>
                          <p className="font-mono text-sm font-extrabold tabular-nums text-white">
                            {formatMoney(total)}
                          </p>
                        </>
                      ) : null}
                    </div>
                    <div className="h-10 rounded-md bg-slate-800" />
                    <div className="h-10 rounded-md bg-slate-800" />
                    <div className="h-10 rounded-md bg-slate-800" />
                  </div>
                </div>

                <div className="flex items-end m-0 p-0">
                  <Card className="rounded-none p-0 m-0 shadow-none border-0 flex-1">
                    <div className="grid grid-cols-4 gap-0 m-0 p-0">
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("7")}
                      >
                        7
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("8")}
                      >
                        8
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("9")}
                      >
                        9
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-23 rounded-none bg-slate-800 text-white hover:bg-slate-700"
                        onClick={() => handleNumpadKey("UP")}
                      >
                        <ChevronUp className="size-8" />
                      </Button>

                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("4")}
                      >
                        4
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("5")}
                      >
                        5
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("6")}
                      >
                        6
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-23 rounded-none bg-slate-800 text-white hover:bg-slate-700"
                        onClick={() => handleNumpadKey("DOWN")}
                      >
                        <ChevronDown className="size-8" />
                      </Button>

                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("1")}
                      >
                        1
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("2")}
                      >
                        2
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("3")}
                      >
                        3
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-23 rounded-none bg-slate-800 text-xl font-bold text-white hover:bg-slate-700"
                        onClick={() => handleNumpadKey("QT")}
                      >
                        QT
                      </Button>

                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey(",")}
                      >
                        ,
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey("0")}
                      >
                        0
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-23 rounded-none text-2xl font-medium text-white hover:bg-slate-900 bg-slate-950"
                        onClick={() => handleNumpadKey(".")}
                      >
                        .
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-23 rounded-none bg-slate-800 text-xl font-bold text-white hover:bg-slate-700"
                        onClick={() => handleNumpadKey("00")}
                      >
                        00
                      </Button>
                    </div>

                    <div className="flex h-22 w-full items-stretch m-0 p-0 ">
                      <Button
                        type="button"
                        className="flex-3 h-full rounded-none bg-[#7faea4] text-slate-950 text-2xl font-bold lowercase hover:bg-[#6e9b92] disabled:opacity-50"
                        onClick={goToPayment}
                      >
                        enter
                      </Button>
                      <Button
                        type="button"
                        className="flex-1 h-full rounded-none bg-[#7faea4] text-slate-950 text-xl font-bold lowercase hover:bg-[#6e9b92] disabled:opacity-50"
                        onClick={() => {
                          cancelEntry();
                          setSearchQuery("");
                          setForceBlankSelectionPanel(true);
                        }}
                      >
                        cancel
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>
            </Card>

            <Card className="w-[300px] shrink-0 flex flex-col gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-3 shadow-none dark:bg-[#0a1514]">
              <div className="grid grid-cols-2 grid-rows-3 gap-[2px] bg-slate-900 border-2 border-slate-900">
                <Button
                  variant="secondary"
                  className="h-full w-full aspect-square bg-amber-400 text-slate-900 font-bold text-center flex flex-col items-center justify-center p-4 hover:bg-amber-500 active:scale-[0.98] transition-transform uppercase rounded-none shadow-none border-0 whitespace-normal"
                >
                  Member card
                </Button>
                <Button
                  variant="secondary"
                  className="h-full w-full aspect-square bg-amber-400 text-slate-900 font-bold text-center flex flex-col items-center justify-center p-4 hover:bg-amber-500 active:scale-[0.98] transition-transform uppercase rounded-none shadow-none border-0 whitespace-normal"
                >
                  Manager login
                </Button>
                <Button
                  variant="secondary"
                  className="h-full w-full aspect-square bg-amber-400 text-slate-900 font-bold text-center flex flex-col items-center justify-center p-4 hover:bg-amber-500 active:scale-[0.98] transition-transform uppercase rounded-none shadow-none border-0 whitespace-normal"
                >
                  Adeeg
                </Button>
                <Button
                  variant="secondary"
                  className="h-full w-full aspect-square bg-amber-400 text-slate-900 font-bold text-center flex flex-col items-center justify-center p-4 hover:bg-amber-500 active:scale-[0.98] transition-transform uppercase rounded-none shadow-none border-0 whitespace-normal"
                >
                  Delivery Charge
                </Button>
                <Button
                  variant="secondary"
                  className="h-full w-full aspect-square bg-amber-400 text-slate-900 font-bold text-center flex flex-col items-center justify-center p-4 hover:bg-amber-500 active:scale-[0.98] transition-transform uppercase rounded-none shadow-none border-0 whitespace-normal"
                >
                  Taloir
                </Button>

                <Button
                  variant="secondary"
                  onClick={handleSuspendClick}
                  className="h-full w-full aspect-square bg-amber-400 text-slate-900 font-bold text-center flex flex-col items-center justify-center p-4 hover:bg-amber-500 active:scale-[0.98] transition-transform uppercase rounded-none shadow-none border-0 whitespace-normal disabled:opacity-50"
                >
                  Suspend
                </Button>
              </div>
              <div className="mt-auto flex flex-col gap-0 border-t-2 border-slate-900">
                <Button
                  variant="secondary"
                  className="h-40 w-full bg-slate-50 hover:bg-slate-100 active:scale-[0.99] rounded-none border-b border-slate-900 shadow-none transition-all p-0"
                >
                  {/* Category Placeholder */}
                </Button>
                <Button
                  variant="secondary"
                  className="h-40 w-full bg-slate-50 hover:bg-slate-100 active:scale-[0.99] rounded-none border-b border-slate-900 shadow-none transition-all p-0"
                >
                  {/* Category Placeholder */}
                </Button>
              </div>
            </Card>
          </>
        ) : null}

        {receiptToPrint != null && typeof document !== "undefined"
          ? createPortal(
              <div className="receipt-print-mount">
                <PosTransactionReceipt transaction={receiptToPrint} />
              </div>,
              document.body,
            )
          : null}
      </main>
    </div>
  );
}
