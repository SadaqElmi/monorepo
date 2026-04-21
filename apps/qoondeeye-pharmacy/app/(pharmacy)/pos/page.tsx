"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Banknote,
  CreditCard,
  FileEdit,
  LogOut,
  Package,
  PauseCircle,
  Pill,
  Printer,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  ShoppingCart,
  Smartphone,
  Undo2,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PosReturnPanel } from "@/components/pos/pos-return-panel";
import {
  PosTransactionReceipt,
  type PosTransaction,
} from "@/components/pos/pos-transaction-receipt";
import {
  clearAuthToken,
  getStoredUser,
  setAuthToken,
  type StoredUser,
} from "@/lib/auth-client";
import { pinLogin } from "@/lib/services/auth";
import {
  createSale,
  getBatches,
  getCategories,
  getProductByBarcode,
  getProducts,
  type Batch,
} from "@/lib/api";

const brand = "#0d968b";

const TAX_RATE = 0.15;
const DEFAULT_DISCOUNT = 2;

const ALL_CATEGORIES_LABEL = "All Categories";

type UnitType = "PC" | "Box" | "Ctn" | "router";

type Product = {
  id: string;
  sku: string;
  name: string;
  meta: string;
  category: string;
  /** Formatted selling unit price (batch selling, or list fallback). */
  price: string;
  /** Unit price charged at the register (selling from stock, else list). */
  priceValue: number;
  /** Catalog list price when higher than selling — shown struck-through in grid. */
  listPriceValue?: number;
  showCompare?: boolean;
  stock: "in" | "low";
  unitType: UnitType;
};

const UNIT_CYCLE: UnitType[] = ["PC", "Box", "Ctn", "router"];

function nextUnitType(cur: UnitType): UnitType {
  const idx = UNIT_CYCLE.indexOf(cur);
  const next = idx === -1 ? 0 : (idx + 1) % UNIT_CYCLE.length;
  return UNIT_CYCLE[next];
}

type CartLine = {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  /** List price per unit when shown above selling (for receipt & cart). */
  listUnitPrice?: number;
  qty: number;
  unitType: UnitType;
};

type HeldOrder = {
  id: string;
  label: string;
  createdAt: number;
  lines: CartLine[];
};

const POS_TRANSACTIONS_KEY = "pharmacare-pos-transactions";
const POS_RECEIPT_SEQ_KEY = "pharmacare-pos-receipt-seq";

function loadPosTransactions(): PosTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POS_TRANSACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PosTransaction[]) : [];
  } catch {
    return [];
  }
}

function persistPosTransactions(rows: PosTransaction[]) {
  try {
    localStorage.setItem(POS_TRANSACTIONS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Keeps the next 5-digit ID above any already saved (handles old RCP-* ids and restores). */
function syncReceiptSeqFromTransactions() {
  if (typeof window === "undefined") return;
  const txs = loadPosTransactions();
  let maxNum = 0;
  for (const t of txs) {
    if (/^\d{1,5}$/.test(t.receiptId)) {
      const n = Number.parseInt(t.receiptId, 10);
      if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
    }
  }
  const stored = Number.parseInt(
    localStorage.getItem(POS_RECEIPT_SEQ_KEY) ?? "0",
    10,
  );
  const fromStored = Number.isFinite(stored) && stored >= 1 ? stored : 1;
  const next = Math.max(maxNum + 1, fromStored);
  try {
    localStorage.setItem(POS_RECEIPT_SEQ_KEY, String(next));
  } catch {
    /* ignore */
  }
}

/** Next sale gets a zero-padded 5-digit transaction ID: 00001, 00002, … up to 99999. */
function newReceiptId(): string {
  let n = Number.parseInt(localStorage.getItem(POS_RECEIPT_SEQ_KEY) ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) n = 1;
  const id = String(n).padStart(5, "0");
  try {
    localStorage.setItem(POS_RECEIPT_SEQ_KEY, String(n + 1));
  } catch {
    /* ignore */
  }
  return id;
}

function priceForProduct(batches: Batch[], productId: string): number {
  const withStock = batches.filter(
    (b) => b.product_id === productId && (b.quantity ?? 0) > 0,
  );
  const prices = withStock
    .map((b) => Number(b.selling_price ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return 0;
  return Math.min(...prices);
}

function listPriceFromProduct(p: {
  listPrice?: number | string | null;
}): number {
  const n = Number(p.listPrice ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Batch selling price first; fallback to catalog list price. Compare-at when list exceeds selling. */
function resolvePosCatalogPricing(
  p: { listPrice?: number | string | null },
  batches: Batch[],
  productId: string,
): {
  sellingValue: number;
  listValue: number;
  showCompare: boolean;
} {
  const listValue = listPriceFromProduct(p);
  const fromBatches = priceForProduct(batches, productId);
  const sellingValue =
    fromBatches > 0 ? fromBatches : listValue > 0 ? listValue : 0;
  const showCompare =
    listValue > 0 &&
    sellingValue > 0 &&
    Math.round(listValue * 100) > Math.round(sellingValue * 100);
  return { sellingValue, listValue, showCompare };
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function lineIconForProductId(productId: string) {
  let h = 0;
  for (let i = 0; i < productId.length; i++) {
    h = (h * 31 + productId.charCodeAt(i)) | 0;
  }
  return h % 2 === 0 ? Activity : Pill;
}

function cartTotals(lines: CartLine[], discount: number) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax - discount;
  return { subtotal, tax, total };
}

function cloneLines(lines: CartLine[]): CartLine[] {
  return lines.map((l) => ({ ...l, lineId: crypto.randomUUID() }));
}

function StockBadge({ stock }: { stock: Product["stock"] }) {
  if (stock === "in") {
    return <Badge variant="success">In Stock</Badge>;
  }
  return (
    <Badge
      variant="secondary"
      className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    >
      Low Stock
    </Badge>
  );
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "mobile", label: "Mobile money", icon: Smartphone },
  { id: "wallet", label: "Digital wallet", icon: Wallet },
] as const;

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

function PosPinGate({ onSuccess }: { onSuccess: () => void }) {
  const [tenant, setTenant] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("posTenantSlug");
      const env = process.env.NEXT_PUBLIC_DEFAULT_TENANT;
      setTenant((saved ?? env ?? "").trim());
    } catch {
      /* ignore */
    }
  }, []);

  const append = (d: string) => {
    setPin((p) => (p.length >= 12 ? p : p + d));
    setError("");
  };

  const backspace = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const submit = async () => {
    setError("");
    const t = tenant.trim();
    if (!t || pin.length < 4) {
      setError("Enter pharmacy code and a PIN (at least 4 digits).");
      return;
    }
    setLoading(true);
    try {
      let branchId: string | undefined;
      try {
        const b = localStorage.getItem("branchId");
        if (b) branchId = b;
      } catch {
        /* ignore */
      }
      const res = await pinLogin(pin, t, branchId);
      const user: StoredUser = {
        id: res.user.id,
        email: res.user.email ?? "",
        name: res.user.name,
        userType: "tenant",
        role: res.role,
        tenantId: res.tenantId ?? undefined,
        tenantSlug: res.tenantSlug ?? undefined,
        assignedBranchId: res.assignedBranchId,
        allowedBranchIds: res.allowedBranchIds,
      };
      setAuthToken(res.token, user);
      try {
        localStorage.setItem("posTenantSlug", t);
        const initialBranchId = res.assignedBranchId ?? res.defaultBranchId;
        if (initialBranchId) {
          localStorage.setItem("branchId", initialBranchId);
        }
      } catch {
        /* ignore */
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "↵"];

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-6"
      style={{
        ["--pos-brand" as string]: brand,
        background: `linear-gradient(160deg, ${brand}18 0%, #0f172a08 45%)`,
      }}
    >
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-[color:var(--pos-brand)]/20 bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-[color:var(--pos-brand)]">
            POS sign in
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Pharmacy code + PIN. Managers use the full login with email.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Pharmacy code (tenant)
          </label>
          <Input
            value={tenant}
            onChange={(e) => setTenant(e.target.value.trim())}
            placeholder="e.g. pharmacy1"
            className="h-11 rounded-xl font-mono text-sm"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <div className="flex h-12 items-center justify-center rounded-xl border-2 border-dashed border-[color:var(--pos-brand)]/30 bg-[color:var(--pos-brand)]/5 font-mono text-2xl tracking-[0.4em] text-foreground">
            {pin ? (
              "●".repeat(pin.length)
            ) : (
              <span className="text-muted-foreground">PIN</span>
            )}
          </div>
          {error ? (
            <p className="text-center text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Button
              key={k}
              type="button"
              variant={k === "↵" ? "default" : "outline"}
              className="h-14 rounded-xl text-lg font-semibold"
              style={
                k === "↵"
                  ? { backgroundColor: brand, color: "#fff" }
                  : undefined
              }
              disabled={loading}
              onClick={() => {
                if (k === "C") backspace();
                else if (k === "↵") void submit();
                else append(k);
              }}
            >
              {k}
            </Button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-[color:var(--pos-brand)] underline"
          >
            Manager sign in (email)
          </Link>
        </p>
      </div>
    </div>
  );
}

function POSUserPageInner() {
  const router = useRouter();
  const tenantSlug = getStoredUser()?.tenantSlug ?? null;

  const [mainTab, setMainTab] = React.useState<
    "register" | "transactions" | "returns"
  >("register");
  const [categoryList, setCategoryList] = React.useState<string[]>([
    ALL_CATEGORIES_LABEL,
  ]);
  const [catalogProducts, setCatalogProducts] = React.useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = React.useState<string>(
    ALL_CATEGORIES_LABEL,
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [heldOrders, setHeldOrders] = React.useState<HeldOrder[]>([]);
  const [discount, setDiscount] = React.useState(DEFAULT_DISCOUNT);
  const [checkoutStep, setCheckoutStep] = React.useState<"cart" | "payment">(
    "cart",
  );
  const [now, setNow] = React.useState(() => new Date());
  const [heldSheetOpen, setHeldSheetOpen] = React.useState(false);
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

  React.useEffect(() => {
    syncReceiptSeqFromTransactions();
    setTransactions(loadPosTransactions());
  }, []);

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
        const mapped: Product[] = prods.map((p) => {
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

  /** Capture wedge-scanner input when focus is not in a text field (scan works without clicking the box). */
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

  /** Keep the search/barcode field focused on Register so typing targets the search box. */
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
    const label = `Hold ${heldOrders.length + 1}`;
    setHeldOrders((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label,
        createdAt: Date.now(),
        lines: cloneLines(cart),
      },
    ]);
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
    setCheckoutStep("payment");
  };

  const completePayment = async (
    paymentLabel: string,
    paymentMethodCode?: string,
  ) => {
    if (cart.length === 0) return;
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
  };

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
          <div className="flex shrink-0 gap-2 rounded-xl border border-[color:var(--pos-brand)]/15 bg-white p-1 dark:bg-slate-900/60">
            <Button
              type="button"
              variant={mainTab === "register" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMainTab("register")}
              className={cn(
                "flex-1 gap-2 rounded-lg font-semibold",
                mainTab === "register" &&
                  "text-primary-foreground shadow-none hover:opacity-90",
                mainTab === "register" &&
                  "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
              )}
              style={
                mainTab === "register" ? { backgroundColor: brand } : undefined
              }
            >
              <ShoppingCart className="size-4" />
              Register
            </Button>
            <Button
              type="button"
              variant={mainTab === "transactions" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMainTab("transactions")}
              className={cn(
                "flex-1 gap-2 rounded-lg font-semibold",
                mainTab === "transactions" &&
                  "text-primary-foreground shadow-none hover:opacity-90",
                mainTab === "transactions" &&
                  "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
              )}
              style={
                mainTab === "transactions"
                  ? { backgroundColor: brand }
                  : undefined
              }
            >
              <Receipt className="size-4" />
              Transactions
              {transactions.length > 0 ? (
                <Badge
                  variant="secondary"
                  className="ml-0.5 h-5 min-w-5 px-1.5 text-[10px] tabular-nums"
                >
                  {transactions.length}
                </Badge>
              ) : null}
            </Button>
            <Button
              type="button"
              variant={mainTab === "returns" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMainTab("returns")}
              className={cn(
                "flex-1 gap-2 rounded-lg font-semibold",
                mainTab === "returns" &&
                  "text-primary-foreground shadow-none hover:opacity-90",
                mainTab === "returns" &&
                  "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
              )}
              style={
                mainTab === "returns" ? { backgroundColor: brand } : undefined
              }
            >
              <RotateCcw className="size-4" />
              Returns
            </Button>
          </div>

          {mainTab === "transactions" ? (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-[color:var(--pos-brand)]/10 dark:bg-slate-900/40">
              <CardHeader className="shrink-0 border-b border-[color:var(--pos-brand)]/10 py-4">
                <CardTitle className="text-base font-bold">
                  Past receipts
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  With a tenant account, receipt numbers come from the server.
                  This list is also kept in the browser until you clear site
                  data.
                </p>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto py-4">
                {transactions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No receipts yet. Complete a sale on Register — we save it
                    and open the print dialog.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {transactions.map((tx) => (
                      <li key={`${tx.saleId ?? tx.receiptId}-${tx.createdAt}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(tx)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--pos-brand)]/15 bg-[color:var(--pos-brand)]/[0.04] px-4 py-3 text-left transition-colors hover:bg-[color:var(--pos-brand)]/10"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold text-[color:var(--pos-brand)]">
                              {tx.receiptId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.createdAt).toLocaleString()} ·{" "}
                              {tx.paymentMethod}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums">
                            {formatMoney(tx.total)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {mainTab === "returns" ? (
            <PosReturnPanel tenantSlug={tenantSlug} brandColor={brand} />
          ) : null}

          {mainTab === "register" ? (
            <>
              <Card className="shrink-0 gap-4 border-[color:var(--pos-brand)]/10 py-6 dark:bg-slate-900/40">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[color:var(--pos-brand)]/60"
                        aria-hidden
                      />
                      <Input
                        id="pos-barcode-search"
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void tryBarcodeScan();
                          }
                        }}
                        placeholder="Search by name or Number barcode"
                        autoComplete="off"
                        autoFocus
                        className="h-11 rounded-xl border-0 bg-[color:var(--pos-brand)]/5 pl-12 pr-4 text-sm focus-visible:ring-[color:var(--pos-brand)]/50"
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-11 gap-2 rounded-xl px-6 font-bold text-primary-foreground shadow-none"
                      style={{ backgroundColor: brand }}
                      onClick={() =>
                        document.getElementById("pos-barcode-search")?.focus()
                      }
                    >
                      <QrCode className="size-5" />
                      Scan
                    </Button>
                  </div>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
                    {categoryList.map((cat) => {
                      const isActive = activeCategory === cat;
                      return (
                        <Button
                          key={cat}
                          type="button"
                          variant={isActive ? "default" : "secondary"}
                          size="sm"
                          onClick={() => setActiveCategory(cat)}
                          className={cn(
                            "shrink-0 rounded-full text-xs font-semibold",
                            isActive &&
                              "text-primary-foreground shadow-none hover:opacity-90",
                            isActive &&
                              "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
                            !isActive &&
                              "bg-[color:var(--pos-brand)]/10 text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/20",
                          )}
                        >
                          {cat}
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-[color:var(--pos-brand)]/20 bg-[color:var(--pos-brand)]/[0.03] px-4 py-12 text-center text-sm text-muted-foreground">
                    No products match this category or search. Try another
                    filter or clear the search box.
                  </div>
                ) : (
                  filteredProducts.map((p) => (
                    <Card
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => addProduct(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          addProduct(p);
                        }
                      }}
                      className="group cursor-pointer gap-0 border-[color:var(--pos-brand)]/5 py-0 ring-1 transition-all hover:border-[color:var(--pos-brand)]/40 dark:bg-slate-900/40"
                    >
                      <CardContent className="flex gap-2 px-3 py-2">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--pos-brand)]/10 transition-colors group-hover:bg-[color:var(--pos-brand)]/15">
                          <Package
                            className="size-6 text-[color:var(--pos-brand)]/70"
                            aria-hidden
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                            {p.sku}
                          </p>
                          <h4 className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                            {p.name}
                          </h4>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground">
                            {p.meta}
                          </p>
                          <div className="mt-1.5 flex items-start justify-between gap-2">
                            <div className="min-w-0 text-left">
                              {p.showCompare &&
                              p.listPriceValue != null &&
                              p.listPriceValue > p.priceValue ? (
                                <div className="flex flex-col gap-0 leading-tight">
                                  <span
                                    className="text-[10px] tabular-nums text-muted-foreground line-through"
                                    aria-label={`List price ${formatMoney(p.listPriceValue)}`}
                                  >
                                    {formatMoney(p.listPriceValue)}
                                  </span>
                                  <span
                                    className="font-bold tabular-nums text-[12px]"
                                    style={{ color: brand }}
                                    aria-label={`Selling price ${p.price}`}
                                  >
                                    {p.price}
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className="font-bold tabular-nums text-[12px]"
                                  style={{ color: brand }}
                                >
                                  {p.price}
                                </span>
                              )}
                            </div>
                            <StockBadge stock={p.stock} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>

        {mainTab === "register" ? (
          <Card className="flex w-[420px] shrink-0 flex-col overflow-hidden border-[color:var(--pos-brand)]/10 p-0 shadow-sm dark:bg-slate-900/40">
            <CardHeader className="flex flex-col gap-3 border-b border-[color:var(--pos-brand)]/5 bg-[color:var(--pos-brand)]/5 py-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart
                    className="size-5 text-[color:var(--pos-brand)]"
                    aria-hidden
                  />
                  <CardTitle className="text-lg font-bold">
                    {checkoutStep === "payment" ? "Payment" : "Current order"}
                  </CardTitle>
                </div>
                {checkoutStep === "cart" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearCart}
                    disabled={cart.length === 0}
                    className="text-xs font-semibold text-red-500 hover:text-red-600 hover:underline disabled:opacity-40"
                  >
                    Clear all
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs font-semibold text-[color:var(--pos-brand)]"
                    onClick={() => setCheckoutStep("cart")}
                  >
                    <Undo2 className="size-3.5" />
                    Back to cart
                  </Button>
                )}
              </div>
              {checkoutStep === "cart" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cart.length === 0}
                    onClick={holdOrder}
                    className="gap-1.5 border-[color:var(--pos-brand)]/30 font-semibold text-[color:var(--pos-brand)]"
                  >
                    <PauseCircle className="size-4" />
                    Hold / suspend
                  </Button>
                  <Sheet open={heldSheetOpen} onOpenChange={setHeldSheetOpen}>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={heldOrders.length === 0}
                        className="font-semibold"
                      >
                        Held orders ({heldOrders.length})
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
                      <SheetHeader>
                        <SheetTitle>Held &amp; suspended</SheetTitle>
                        <SheetDescription>
                          Recall a sale when the customer returns to pay. Your
                          current register cart is replaced when you recall.
                        </SheetDescription>
                      </SheetHeader>
                      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-4">
                        {heldOrders.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No held orders.
                          </p>
                        ) : (
                          heldOrders.map((h) => (
                            <Card
                              key={h.id}
                              className="gap-2 border-[color:var(--pos-brand)]/15 py-3"
                            >
                              <CardContent className="flex flex-col gap-3 px-3 py-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-semibold">{h.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {h.lines.length} line(s) ·{" "}
                                      {formatMoney(
                                        cartTotals(h.lines, 0).subtotal,
                                      )}{" "}
                                      subtotal
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      style={{ backgroundColor: brand }}
                                      className="text-primary-foreground"
                                      onClick={() => recallHeld(h)}
                                    >
                                      Recall
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => removeHeld(h.id)}
                                    >
                                      Drop
                                    </Button>
                                  </div>
                                </div>
                                <ul className="text-xs text-muted-foreground">
                                  {h.lines.slice(0, 4).map((l) => (
                                    <li key={l.lineId}>
                                      {l.name} × {l.qty}
                                    </li>
                                  ))}
                                  {h.lines.length > 4 ? <li>…</li> : null}
                                </ul>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              )}
            </CardHeader>

            {checkoutStep === "cart" ? (
              <>
                <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
                  {cart.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Tap a product to add lines, or hold the order when a
                      customer steps away.
                    </p>
                  ) : (
                    <>
                      {/* Table-like sub-header for cart lines */}
                      <div className="grid grid-cols-[2.2fr_0.8fr_1fr_1fr_1fr] items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                        <span>Item</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Unit</span>
                        <span className="text-right">Cart disc</span>
                        <span className="text-right">Line</span>
                      </div>

                      {cart.map((item) => {
                        const Icon = lineIconForProductId(item.productId);
                        const lineSubtotal = item.unitPrice * item.qty;
                        // Allocate the cart discount proportionally across lines.
                        const allocatedDiscount =
                          subtotal > 0
                            ? (lineSubtotal / subtotal) * discount
                            : 0;
                        const discountedLinePrice =
                          lineSubtotal - allocatedDiscount;

                        const discText =
                          allocatedDiscount > 0
                            ? `-${formatMoney(allocatedDiscount)}`
                            : formatMoney(0);

                        return (
                          <Card
                            key={item.lineId}
                            className="gap-0 border-[color:var(--pos-brand)]/5 py-3 dark:bg-[#102220]/30"
                          >
                            <CardContent className="grid grid-cols-[2.2fr_0.8fr_1fr_1fr_1fr] items-center gap-2 px-3 py-0">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[color:var(--pos-brand)]/10">
                                  <Icon
                                    className="size-5 text-[color:var(--pos-brand)]"
                                    aria-hidden
                                  />
                                </div>
                                <div className="min-w-0">
                                  <h5 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {item.name}
                                  </h5>
                                  {item.listUnitPrice != null &&
                                  item.listUnitPrice > item.unitPrice ? (
                                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                                      <span className="line-through tabular-nums">
                                        {formatMoney(item.listUnitPrice)}
                                      </span>
                                      <span className="mx-1 text-muted-foreground/80">
                                        →
                                      </span>
                                      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                        {formatMoney(item.unitPrice)}
                                      </span>
                                      <span className="sr-only">
                                        {" "}
                                        list to sale per unit
                                      </span>
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center justify-end">
                                <div className="flex items-center gap-2 rounded-lg bg-[color:var(--pos-brand)]/5 p-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-6 text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/10"
                                    aria-label="Decrease quantity"
                                    onClick={() =>
                                      setQty(item.lineId, item.qty - 1)
                                    }
                                  >
                                    −
                                  </Button>
                                  <span className="w-4 text-center text-xs font-bold">
                                    {item.qty}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-6 text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/10"
                                    aria-label="Increase quantity"
                                    onClick={() =>
                                      setQty(item.lineId, item.qty + 1)
                                    }
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>

                              <div className="text-right">
                                <button
                                  type="button"
                                  className="text-sm font-medium text-slate-800 dark:text-slate-100 cursor-pointer hover:opacity-80"
                                  onClick={() => {
                                    setCart((prev) =>
                                      prev.map((l) =>
                                        l.lineId === item.lineId
                                          ? {
                                              ...l,
                                              unitType: nextUnitType(
                                                l.unitType,
                                              ),
                                            }
                                          : l,
                                      ),
                                    );
                                  }}
                                  aria-label={`Change unit for ${item.name}`}
                                >
                                  {item.unitType}
                                </button>
                              </div>

                              <div className="text-right text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                {discText}
                              </div>

                              <div className="text-right text-sm font-bold text-slate-800 dark:text-slate-100">
                                {formatMoney(discountedLinePrice)}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </>
                  )}
                </CardContent>

                <CardFooter className="flex flex-col gap-4 border-t border-[color:var(--pos-brand)]/10 bg-[color:var(--pos-brand)]/5 py-6">
                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">
                        {formatMoney(subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax (15%)</span>
                      <span className="font-medium">{formatMoney(tax)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          −{formatMoney(discount)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-[color:var(--pos-brand)]"
                          aria-label="Edit discount"
                          onClick={() => {
                            const v = window.prompt(
                              "Discount amount (USD)",
                              String(discount),
                            );
                            if (v == null) return;
                            const n = Number.parseFloat(v);
                            if (Number.isFinite(n) && n >= 0) setDiscount(n);
                          }}
                        >
                          <FileEdit className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <Separator className="my-1 bg-[color:var(--pos-brand)]/10" />
                    <div className="flex items-end justify-between pt-1">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        Total
                      </span>
                      <span
                        className="text-2xl font-black"
                        style={{ color: brand }}
                      >
                        {formatMoney(total)}
                      </span>
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto rounded-xl border-2 border-[color:var(--pos-brand)]/20 py-4 font-bold text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/5"
                      onClick={clearCart}
                      disabled={cart.length === 0}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="h-auto gap-2 rounded-xl py-4 font-bold text-primary-foreground shadow-lg shadow-[color:var(--pos-brand)]/20 disabled:opacity-50"
                      style={{ backgroundColor: brand }}
                      disabled={cart.length === 0}
                      onClick={goToPayment}
                    >
                      Total
                    </Button>
                  </div>
                </CardFooter>
              </>
            ) : (
              <CardFooter className="flex min-h-0 flex-1 flex-col gap-6 border-t border-[color:var(--pos-brand)]/10 bg-[color:var(--pos-brand)]/5 py-8">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Amount due</p>
                  <p
                    className="text-3xl font-black tabular-nums"
                    style={{ color: brand }}
                  >
                    {formatMoney(total)}
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-3">
                  {PAYMENT_METHODS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <Button
                        key={m.id}
                        type="button"
                        variant="outline"
                        className="h-auto flex-col gap-2 rounded-xl border-2 border-[color:var(--pos-brand)]/25 py-5 font-semibold hover:bg-[color:var(--pos-brand)]/10"
                        onClick={() => void completePayment(m.label, m.id)}
                      >
                        <Icon className="size-6 text-[color:var(--pos-brand)]" />
                        {m.label}
                      </Button>
                    );
                  })}
                </div>
              </CardFooter>
            )}
          </Card>
        ) : null}

        <Sheet
          open={selectedReceipt != null}
          onOpenChange={(open) => {
            if (!open) setSelectedReceipt(null);
          }}
        >
          <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
            <SheetHeader className="no-print shrink-0">
              <SheetTitle>Transaction receipt</SheetTitle>
              <SheetDescription>
                Preview matches the printed layout. Use Print receipt for your
                printer.
              </SheetDescription>
            </SheetHeader>
            {selectedReceipt ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 py-4">
                <PosTransactionReceipt transaction={selectedReceipt} />
                <Button
                  type="button"
                  className="no-print gap-2 font-semibold text-primary-foreground"
                  style={{ backgroundColor: brand }}
                  onClick={() => setReceiptToPrint(selectedReceipt)}
                >
                  <Printer className="size-4" />
                  Print receipt
                </Button>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>

        {receiptToPrint != null && typeof document !== "undefined"
          ? createPortal(
              <div className="receipt-print-mount">
                <PosTransactionReceipt transaction={receiptToPrint} />
              </div>,
              document.body,
            )
          : null}
      </main>

      <footer className="flex h-12 shrink-0 items-center justify-between border-t border-[color:var(--pos-brand)]/10 bg-white px-8 text-[11px] text-muted-foreground dark:bg-[#102220]/80">
        <div className="flex gap-6">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">
              F1
            </kbd>{" "}
            Search
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">
              F2
            </kbd>{" "}
            Customer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">
              ESC
            </kbd>{" "}
            Cancel
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-[color:var(--pos-brand)]/25 text-[11px] text-slate-700 hover:bg-[color:var(--pos-brand)]/10 dark:text-slate-200"
            onClick={handleLogout}
          >
            <LogOut className="size-3.5" aria-hidden />
            Log out
          </Button>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Register #01
          </span>
          <span className="font-medium uppercase text-slate-700 dark:text-slate-300">
            {formattedFooter}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function POSUserPage() {
  return (
    <PosSessionGate>
      <POSUserPageInner />
    </PosSessionGate>
  );
}
