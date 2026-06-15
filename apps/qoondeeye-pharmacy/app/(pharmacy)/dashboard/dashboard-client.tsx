"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { format, startOfDay, startOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  AlertCircle,
  BarChart2,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  CreditCard,
  EllipsisVertical,
  Loader2,
  Package2,
  PiggyBank,
  Plus,
  ReceiptText,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getResolvedStoredUser } from "@/lib/auth-client";
import {
  getReportBranchSnapshot,
  useReportBranchQuery,
} from "@/hooks/use-branch-for-reports";
import { formatApiErrorForUser } from "@/lib/services/http";
import { CachedQueryToolbar } from "@/components/api/cached-query-toolbar";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import {
  getBatches,
  getBranches,
  getDashboardSeries,
  getInventory,
  getProducts,
  getPurchases,
  getSales,
  getTopProducts,
  type Batch,
  type Branch,
  type InventoryEntry,
  type Product,
  type Purchase,
  type Sale,
} from "@/lib/api";
import type {
  DashboardSeriesPoint,
  TopProductsResult,
} from "@/lib/services/accounting";

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number) {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTooltipMoney(
  value: number | string | readonly (string | number)[] | undefined,
) {
  if (Array.isArray(value)) {
    return formatMoney(Number(value[0] ?? 0));
  }
  return formatMoney(Number(value ?? 0));
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(0)}%`;
}

/** Local calendar day key YYYY-MM-DD */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function saleDayKey(saleDate: string | null): string | null {
  if (!saleDate) return null;
  const d = new Date(saleDate);
  if (Number.isNaN(d.getTime())) return null;
  return dayKey(d);
}

type DashboardBundle = {
  sales: Sale[];
  purchases: Purchase[];
  inventory: InventoryEntry[];
  batches: Batch[];
  products: Product[];
  branches: Branch[];
};

export type DashboardPageClientProps = {
  tenantSlug?: string;
  initialBundle?: DashboardBundle;
  initialSeries?: DashboardSeriesPoint[] | null;
  initialTopProducts?: TopProductsResult | null;
  serverPrefetched?: boolean;
};

export default function DashboardPageClient({
  tenantSlug: tenantSlugProp,
  initialBundle,
  initialSeries,
  initialTopProducts,
  serverPrefetched = false,
}: DashboardPageClientProps) {
  const [tenantSlug] = React.useState(
    () =>
      tenantSlugProp?.trim() ||
      getResolvedStoredUser()?.tenantSlug ||
      "pharmacy1",
  );

  const branchFacet = useErpBranchFacet();
  const queryClient = useQueryClient();

  const [date, setDate] = React.useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: now };
  });

  const { branchId, aggregateAll } = useReportBranchQuery();

  const bundleQuery = useQuery({
    queryKey: erpKeys.dashboardBundle(tenantSlug, branchFacet),
    enabled: Boolean(
      tenantSlug && (branchFacet || (serverPrefetched && initialBundle)),
    ),
    staleTime: ERP_STALE_LIST,
    initialData: serverPrefetched && initialBundle ? initialBundle : undefined,
    queryFn: async ({ signal }) => {
      const [s, p, inv, bat, prod, br] = await Promise.all([
        getSales(tenantSlug, { signal }),
        getPurchases(tenantSlug, { signal }),
        getInventory(tenantSlug, { signal }),
        getBatches(tenantSlug, { signal }),
        getProducts(tenantSlug, { signal }),
        getBranches(tenantSlug, { signal }),
      ]);
      return {
        sales: s,
        purchases: p,
        inventory: inv,
        batches: bat,
        products: prod,
        branches: br,
      };
    },
  });

  const fromStr = date?.from != null ? format(date.from, "yyyy-MM-dd") : "";
  const toStr = date?.to != null ? format(date.to, "yyyy-MM-dd") : "";

  const seriesQuery = useQuery({
    queryKey: erpKeys.dashboardSeries(
      tenantSlug,
      branchFacet,
      fromStr,
      toStr,
      branchId ?? "",
      aggregateAll,
    ),
    enabled: Boolean(
      tenantSlug &&
      (branchFacet || serverPrefetched) &&
      date?.from != null &&
      date?.to != null,
    ),
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialSeries != null ? initialSeries : undefined,
    queryFn: ({ signal }) => {
      const scope = getReportBranchSnapshot();
      return getDashboardSeries(
        tenantSlug,
        fromStr,
        toStr,
        scope.branchId,
        scope.aggregateAll,
        { signal },
      );
    },
  });

  const topProductsQuery = useQuery({
    queryKey: erpKeys.dashboardTopProducts(
      tenantSlug,
      branchFacet,
      fromStr,
      toStr,
      branchId ?? "",
      8,
      "revenue",
      aggregateAll,
    ),
    enabled: Boolean(
      tenantSlug &&
      (branchFacet || serverPrefetched) &&
      date?.from != null &&
      date?.to != null &&
      (Boolean(branchId) || aggregateAll) &&
      (bundleQuery.isSuccess || (serverPrefetched && initialBundle)),
    ),
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialTopProducts != null
        ? initialTopProducts
        : undefined,
    queryFn: ({ signal }) => {
      const scope = getReportBranchSnapshot();
      return getTopProducts(
        tenantSlug,
        fromStr,
        toStr,
        scope.branchId,
        8,
        "revenue",
        scope.aggregateAll,
        { signal },
      );
    },
  });

  const sales = bundleQuery.data?.sales ?? [];
  const purchases = bundleQuery.data?.purchases ?? [];
  const inventory = bundleQuery.data?.inventory ?? [];
  const batches = bundleQuery.data?.batches ?? [];
  const products = bundleQuery.data?.products ?? [];
  const branches = bundleQuery.data?.branches ?? [];

  const loading = bundleQuery.isPending;
  const error = bundleQuery.error
    ? formatApiErrorForUser(bundleQuery.error)
    : null;

  const acctSeries = seriesQuery.data ?? [];
  const acctLoading = seriesQuery.isFetching;

  const topProductLines = topProductsQuery.data?.lines ?? [];
  const topProductsLoading = topProductsQuery.isFetching;

  const acctChartData = React.useMemo(
    () =>
      acctSeries.map((r) => {
        const d = new Date(r.date);
        const label = Number.isNaN(d.getTime()) ? r.date : format(d, "MMM d");
        return {
          label,
          sales: r.sales,
          expenses: r.expenses,
          profit: r.profit,
        };
      }),
    [acctSeries],
  );

  const topProductsChartData = React.useMemo(
    () =>
      topProductLines.map((l) => {
        const raw = l.productName ?? "Product";
        const name = raw.length > 36 ? `${raw.slice(0, 34)}…` : raw;
        return {
          name,
          revenue: l.revenue,
          quantitySold: l.quantitySold,
        };
      }),
    [topProductLines],
  );

  const branchById = React.useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const stats = React.useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const monthStart = startOfMonth(now);
    const dayOfMonth = now.getDate();
    const lastMonthSamePeriodEnd = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      dayOfMonth,
      23,
      59,
      59,
      999,
    );
    const lastMonthStart = startOfMonth(
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
    );

    let todayTotal = 0;
    let yesterdayTotal = 0;
    let monthTotal = 0;
    let lastMonthPeriodTotal = 0;

    for (const s of sales) {
      const t = toNumber(s.total_amount);
      if (!s.sale_date) continue;
      const d = new Date(s.sale_date);
      if (Number.isNaN(d.getTime())) continue;
      if (d >= todayStart && d < tomorrowStart) todayTotal += t;
      if (d >= yesterdayStart && d < todayStart) yesterdayTotal += t;
      if (d >= monthStart && d <= now) monthTotal += t;
      if (d >= lastMonthStart && d <= lastMonthSamePeriodEnd)
        lastMonthPeriodTotal += t;
    }

    const monthSalesCount = sales.filter((s) => {
      if (!s.sale_date) return false;
      const d = new Date(s.sale_date);
      return !Number.isNaN(d.getTime()) && d >= monthStart && d <= now;
    }).length;
    const avgTransaction =
      monthSalesCount > 0 ? monthTotal / monthSalesCount : 0;

    let purchasesMtd = 0;
    let purchasesPrevMtd = 0;
    for (const p of purchases) {
      const t = toNumber(p.total_amount);
      if (!p.purchase_date) continue;
      const d = new Date(p.purchase_date);
      if (Number.isNaN(d.getTime())) continue;
      if (d >= monthStart && d <= now) purchasesMtd += t;
      if (d >= lastMonthStart && d <= lastMonthSamePeriodEnd)
        purchasesPrevMtd += t;
    }

    const lowStockRows = inventory.filter(
      (i) => i.reorder_level > 0 && i.quantity <= i.reorder_level,
    );
    const lowStockCount = lowStockRows.length;

    const startToday = startOfDay(now);
    let expiredCount = 0;
    for (const b of batches) {
      if (!b.expiry_date || !b.quantity || b.quantity <= 0) continue;
      const exp = new Date(b.expiry_date);
      if (Number.isNaN(exp.getTime())) continue;
      if (exp < startToday) expiredCount += 1;
    }

    // Last 7 days daily revenue (including today)
    const trendKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      trendKeys.push(dayKey(d));
    }
    const dailyMap = new Map<string, number>();
    for (const k of trendKeys) dailyMap.set(k, 0);
    for (const s of sales) {
      const k = saleDayKey(s.sale_date ?? null);
      if (k && dailyMap.has(k)) {
        dailyMap.set(k, (dailyMap.get(k) ?? 0) + toNumber(s.total_amount));
      }
    }
    const trendValues = trendKeys.map((k) => dailyMap.get(k) ?? 0);
    const trendFirstHalf = trendValues.slice(0, 3).reduce((a, b) => a + b, 0);
    const trendSecondHalf = trendValues.slice(4, 7).reduce((a, b) => a + b, 0);
    const trendPct =
      trendFirstHalf === 0
        ? null
        : ((trendSecondHalf - trendFirstHalf) / trendFirstHalf) * 100;

    // Last 6 calendar months purchase totals
    const monthBars: { label: string; total: number; y: number; m: number }[] =
      [];
    for (let i = 5; i >= 0; i--) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = format(first, "MMM");
      let total = 0;
      for (const p of purchases) {
        if (!p.purchase_date) continue;
        const d = new Date(p.purchase_date);
        if (Number.isNaN(d.getTime())) continue;
        if (d >= first && d < next) total += toNumber(p.total_amount);
      }
      monthBars.push({
        label,
        total,
        y: first.getFullYear(),
        m: first.getMonth(),
      });
    }
    const lastBar = monthBars[5]?.total ?? 0;
    const prevBar = monthBars[4]?.total ?? 0;
    const expenseTrendPct = pctChange(lastBar, prevBar);

    const todayVsYest = pctChange(todayTotal, yesterdayTotal);
    const monthVsLast = pctChange(monthTotal, lastMonthPeriodTotal);
    const purchaseVsLast = pctChange(purchasesMtd, purchasesPrevMtd);

    const sortedSales = [...sales]
      .filter((s) => s.sale_date)
      .sort((a, b) => {
        const ta = new Date(a.sale_date!).getTime();
        const tb = new Date(b.sale_date!).getTime();
        return tb - ta;
      })
      .slice(0, 8);

    const lowStockDisplay = [...lowStockRows]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 6)
      .map((row) => {
        const prod = row.product_id
          ? productById.get(row.product_id)
          : undefined;
        const name = prod?.name ?? "Unknown product";
        const sku = prod?.sku ?? "—";
        const initials =
          name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join("") || "—";
        const ratio = row.reorder_level ? row.quantity / row.reorder_level : 0;
        const level =
          ratio <= 0.25 ? ("critical" as const) : ("warning" as const);
        return {
          id: row.id,
          code: initials,
          name,
          sku,
          units: row.quantity,
          min: row.reorder_level,
          level,
        };
      });

    return {
      todayTotal,
      yesterdayTotal,
      monthTotal,
      avgTransaction,
      purchasesMtd,
      lowStockCount,
      expiredCount,
      todayVsYest,
      monthVsLast,
      purchaseVsLast,
      trendValues,
      trendPct,
      trendKeys,
      monthBars,
      expenseTrendPct,
      sortedSales,
      lowStockDisplay,
    };
  }, [sales, purchases, inventory, batches, productById]);
  const trendChartData = React.useMemo(
    () =>
      stats.trendKeys.map((k, idx) => {
        const [y, m, d] = k.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        return {
          day: format(dt, "EEE"),
          revenue: stats.trendValues[idx] ?? 0,
        };
      }),
    [stats.trendKeys, stats.trendValues],
  );
  const purchasesChartData = React.useMemo(
    () => stats.monthBars.map((m) => ({ month: m.label, total: m.total })),
    [stats.monthBars],
  );

  const kpiBadge = (
    pct: number | null,
    invert = false,
  ): { label: string; className: string } => {
    if (pct === null || !Number.isFinite(pct)) {
      return { label: "—", className: "text-muted-foreground bg-muted" };
    }
    const good = invert ? pct < 0 : pct > 0;
    return {
      label: formatPct(pct),
      className: good
        ? "text-green-500 bg-green-500/10"
        : "text-red-500 bg-red-500/10",
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-8 p-6 md:p-8">
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* Welcome section */}
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold">Dashboard Overview</h2>
            <p className="text-sm text-muted-foreground">
              Detailed insights for your pharmacy operations today.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <CachedQueryToolbar
              dataUpdatedAt={Math.max(
                bundleQuery.dataUpdatedAt,
                seriesQuery.dataUpdatedAt,
                topProductsQuery.dataUpdatedAt,
              )}
              isFetching={
                bundleQuery.isFetching ||
                seriesQuery.isFetching ||
                topProductsQuery.isFetching
              }
              onRefresh={() => {
                void queryClient.invalidateQueries({
                  queryKey: erpKeys.dashboardBundle(tenantSlug, branchFacet),
                });
                void seriesQuery.refetch();
                void topProductsQuery.refetch();
              }}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 rounded-xl border-muted bg-card text-sm font-medium justify-start text-left"
                >
                  <CalendarDays className="h-4 w-4" />
                  {date?.from && date.to ? (
                    `${format(date.from, "MMM d, yyyy")} - ${format(
                      date.to,
                      "MMM d, yyyy",
                    )}`
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button
              asChild
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              <Link href="/pos">
                <Plus className="h-4 w-4" />
                New Order
              </Link>
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div
          className={`grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6 ${loading ? "opacity-80" : ""}`}
        >
          <KpiCard
            iconBg="bg-primary/10"
            icon={<CreditCard className="h-5 w-5 text-primary" />}
            label="Today Sales"
            value={loading ? "—" : formatMoney(stats.todayTotal)}
            badgeLabel={kpiBadge(stats.todayVsYest).label}
            badgeClass={kpiBadge(stats.todayVsYest).className}
          />
          <KpiCard
            iconBg="bg-blue-500/10"
            icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
            label="Monthly Sales"
            value={loading ? "—" : formatMoney(stats.monthTotal)}
            badgeLabel={kpiBadge(stats.monthVsLast).label}
            badgeClass={kpiBadge(stats.monthVsLast).className}
          />
          <KpiCard
            iconBg="bg-emerald-500/10"
            icon={<PiggyBank className="h-5 w-5 text-emerald-500" />}
            label="Avg. sale (MTD)"
            value={loading ? "—" : formatMoney(stats.avgTransaction)}
            badgeLabel="MTD"
            badgeClass="text-muted-foreground bg-muted"
          />
          <KpiCard
            iconBg="bg-amber-500/10"
            icon={<ReceiptText className="h-5 w-5 text-amber-500" />}
            label="Purchases (MTD)"
            value={loading ? "—" : formatMoney(stats.purchasesMtd)}
            badgeLabel={kpiBadge(stats.purchaseVsLast, true).label}
            badgeClass={kpiBadge(stats.purchaseVsLast, true).className}
          />
          <KpiCard
            className="border-l-4 border-l-red-500"
            iconBg="bg-red-500/10"
            icon={<Package2 className="h-5 w-5 text-red-500" />}
            label="Low Stock"
            value={loading ? "—" : String(stats.lowStockCount)}
            badgeLabel={stats.lowStockCount > 0 ? "Reorder" : "OK"}
            badgeClass={
              stats.lowStockCount > 0
                ? "text-red-500"
                : "text-green-500 bg-green-500/10"
            }
          />
          <KpiCard
            className="border-l-4 border-l-orange-500"
            iconBg="bg-orange-500/10"
            icon={<AlertCircle className="h-5 w-5 text-orange-500" />}
            label="Expired batches"
            value={loading ? "—" : String(stats.expiredCount)}
            badgeLabel={stats.expiredCount > 0 ? "Check" : "None"}
            badgeClass={
              stats.expiredCount > 0
                ? "text-orange-500"
                : "text-muted-foreground bg-muted"
            }
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Sales trend */}
          <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
            <CardContent className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold leading-none">
                    Sales Trend
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Daily revenue for the last 7 days
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {stats.trendPct !== null &&
                  Number.isFinite(stats.trendPct) ? (
                    <span
                      className={`flex items-center gap-1 text-xs font-medium ${
                        stats.trendPct >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {stats.trendPct >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {formatPct(stats.trendPct)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  <button
                    type="button"
                    className="rounded p-1 transition-colors hover:bg-muted"
                  >
                    <EllipsisVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="relative h-64">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendChartData}>
                      <defs>
                        <linearGradient
                          id="salesRevenue"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#0d968b"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="95%"
                            stopColor="#0d968b"
                            stopOpacity={0.03}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="hsl(var(--muted))"
                      />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={70}
                        tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                      />
                      <Tooltip
                        formatter={(
                          value:
                            | number
                            | string
                            | undefined
                            | readonly (string | number)[],
                        ) => formatTooltipMoney(value)}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0d968b"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#salesRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Monthly purchases */}
          <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
            <CardContent className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold leading-none">
                    Monthly purchases
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Purchase totals, last 6 months
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {stats.expenseTrendPct !== null &&
                  Number.isFinite(stats.expenseTrendPct) ? (
                    <span
                      className={`flex items-center gap-1 text-xs font-medium ${
                        stats.expenseTrendPct <= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {stats.expenseTrendPct >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {formatPct(stats.expenseTrendPct)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  <button
                    type="button"
                    className="rounded p-1 transition-colors hover:bg-muted"
                  >
                    <BarChart2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex h-64 items-end justify-between px-4">
                {loading ? (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={purchasesChartData}
                      margin={{ top: 8, right: 0, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="hsl(var(--muted))"
                      />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={70}
                        tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                      />
                      <Tooltip
                        formatter={(
                          value:
                            | number
                            | string
                            | undefined
                            | readonly (string | number)[],
                        ) => formatTooltipMoney(value)}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Bar
                        dataKey="total"
                        radius={[8, 8, 0, 0]}
                        fill="hsl(var(--primary))"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold leading-none">
                  Accounting (journal)
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sales, expenses, and profit from double-entry journals for the
                  selected date range
                </p>
              </div>
              <Link
                href="/accounting/reports/balance-sheet"
                className="text-sm font-semibold text-primary hover:underline"
              >
                View reports
              </Link>
            </div>
            <div className="relative h-72">
              {acctLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : acctChartData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No journal activity in this period (complete a sale or expense
                  after enabling accounting).
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={acctChartData}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--muted))"
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                    />
                    <Tooltip
                      formatter={(v) => formatTooltipMoney(v)}
                      labelFormatter={(l) => String(l)}
                    />
                    <Legend />
                    <Bar
                      dataKey="sales"
                      name="Sales (revenue)"
                      fill="#0d968b"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="expenses"
                      name="Expenses"
                      fill="#f59e0b"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="profit"
                      name="Profit"
                      fill="#6366f1"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold leading-none">
                  Top products by revenue
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sale lines in the selected date range for your active branch
                  (same range as the chart above).
                </p>
              </div>
              <Link
                href="/customers/invoices"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Sales
              </Link>
            </div>
            <div className="relative min-h-[220px]">
              {!branchId && !aggregateAll ? (
                <p className="flex min-h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
                  Select a branch (e.g. from Purchases or your location picker)
                  to see top products.
                </p>
              ) : topProductsLoading ? (
                <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : topProductsChartData.length === 0 ? (
                <p className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                  No product sales in this period for this branch.
                </p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(220, topProductsChartData.length * 40)}
                >
                  <BarChart
                    layout="vertical"
                    data={topProductsChartData}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal
                      vertical={false}
                      stroke="hsl(var(--muted))"
                    />
                    <XAxis
                      type="number"
                      tickLine={false}
                      tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                      fontSize={11}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={148}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => formatTooltipMoney(value)}
                      labelFormatter={(label) => String(label)}
                    />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      fill="#0d968b"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tables section */}
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          {/* Recent sales */}
          <Card className="xl:col-span-2 rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/80 p-6">
              <h3 className="text-lg font-bold">Recent Sales</h3>
              <Link
                href="/customers/invoices"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : stats.sortedSales.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  No sales recorded yet.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {["Receipt", "Branch", "Date", "Amount", "Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-6 py-4 text-xs font-bold uppercase text-muted-foreground"
                          >
                            {h === "Amount" ? (
                              <span className="flex justify-end">{h}</span>
                            ) : (
                              h
                            )}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80">
                    {stats.sortedSales.map((sale) => {
                      const branch = sale.branch_id
                        ? branchById.get(sale.branch_id)
                        : null;
                      const receipt = (sale.receipt_number ?? "").trim() || "—";
                      const dateStr = sale.sale_date
                        ? format(new Date(sale.sale_date), "MMM d, HH:mm")
                        : "—";
                      return (
                        <tr
                          key={sale.id}
                          className="transition-colors hover:bg-muted/60"
                        >
                          <td className="px-6 py-4 text-sm font-medium">
                            {receipt}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {branch?.name ??
                              (sale.branch_id
                                ? `Branch ${sale.branch_id.slice(0, 8)}…`
                                : "—")}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {dateStr}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-bold">
                            {formatMoney(toNumber(sale.total_amount))}
                          </td>
                          <td className="px-6 py-4">
                            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                              Recorded
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          {/* Low stock products */}
          <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/80 p-6">
              <h3 className="text-lg font-bold">Low Stock Products</h3>
              <Link
                href="/items"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Inventory
              </Link>
            </div>
            <div className="space-y-6 p-6">
              {loading ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : stats.lowStockDisplay.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  No lines at or below reorder level.
                </p>
              ) : (
                stats.lowStockDisplay.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold ${
                          item.level === "warning"
                            ? "bg-orange-500/10 text-orange-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {item.code}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          SKU: {item.sku}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-xs font-bold ${
                          item.level === "warning"
                            ? "text-orange-500"
                            : "text-red-500"
                        }`}
                      >
                        {item.units} units
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Min: {item.min}
                      </p>
                    </div>
                  </div>
                ))
              )}

              <Button
                asChild
                variant="outline"
                className="mt-4 w-full rounded-xl bg-muted text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/80"
              >
                <Link href="/items">View inventory items</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  badgeLabel,
  badgeClass,
  className,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  badgeLabel: string;
  badgeClass: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/80 bg-card p-5 shadow-sm ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={`rounded-lg p-2 ${iconBg}`}>{icon}</div>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}
        >
          {badgeLabel}
        </span>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
