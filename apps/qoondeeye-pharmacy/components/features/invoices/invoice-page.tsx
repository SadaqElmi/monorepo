"use client";

import {
  ChevronLeft,
  ChevronRight,
  Calculator,
  CreditCard,
  Download,
  Filter,
  Edit2,
  Loader2,
  MoreHorizontal,
  Lightbulb,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreateInvoiceDrawerForm } from "@/components/erp/create-invoice-drawer-form";
import { ErpWorkbenchShell } from "@/components/erp/erp-workbench-shell";
import { useDrawerHost } from "@/components/DrawerHost";
import { getStoredUser } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import {
  getBranches,
  getProducts,
  getSales,
  createSale,
  updateSale,
  deleteSale,
  type Branch,
  type Product,
  type Sale,
} from "@/lib/api";

export default function CustomerInvoicesPage() {
  const { openDrawer } = useDrawerHost();
  type SalesRow = {
    id: string;
    receiptNumber: string;
    branchId: string;
    branchUuid: string | null;
    totalAmount: number;
    discountAmount: number | null;
    taxAmount: number;
    status: "RECORDED";
    saleDate: string;
    saleDateIso: string | null;
  };

  const [salesRows, setSalesRows] = React.useState<SalesRow[]>([]);

  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [, setError] = React.useState<string | null>(null);

  const [branchKey, setBranchKey] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("branchId");
    if (!v || v === "all") return null;
    return v;
  });

  // Refetch branch-scoped data when the sidebar location changes.
  React.useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as {
        branchId?: string | null;
      };
      setBranchKey(detail?.branchId ?? null);
    };
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);

  const [query, setQuery] = React.useState("");
  const pageSize = 8;
  const [page, setPage] = React.useState(1);

  type FormMode = "create" | "edit";
  type EditableSale = {
    id: string;
    receiptNumber: string;
    branchId: string;
    productId: string;
    quantity: string;
    unitPrice: string;
    totalAmount: string;
    discount: string;
    tax: string;
  };

  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("create");
  const [activeSale, setActiveSale] = React.useState<EditableSale | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<SalesRow | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const canCreate = branches.length > 0;

  const mapSalesRows = React.useCallback(
    (salesData: Sale[], branchesData: Branch[]): SalesRow[] => {
      const branchById = new Map(branchesData.map((b) => [b.id, b]));

      const toNumber = (v: number | string | null | undefined) => {
        if (v === null || v === undefined) return 0;
        const n = typeof v === "string" ? Number(v) : v;
        return Number.isFinite(n) ? n : 0;
      };

      return salesData.map((s) => {
        const b = branchById.get(s.branch_id ?? "");

        const total = toNumber(s.total_amount);
        const discount =
          s.discount === null || s.discount === undefined
            ? null
            : (() => {
                const d = toNumber(s.discount);
                return d === 0 ? null : d;
              })();
        const tax = toNumber(s.tax);

        const saleDate = s.sale_date
          ? new Date(s.sale_date).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";

        const rn = (s.receipt_number ?? "").trim();

        return {
          id: s.id,
          receiptNumber: rn || "—",
          branchId:
            b?.name ?? (s.branch_id ? `BR-${s.branch_id.slice(0, 8)}` : "—"),
          branchUuid: s.branch_id ?? null,
          totalAmount: total,
          discountAmount: discount,
          taxAmount: tax,
          status: "RECORDED",
          saleDate,
          saleDateIso: s.sale_date ?? null,
        };
      });
    },
    [],
  );

  const loadSalesData = React.useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);

    const [salesData, branchesData, productsData] = await Promise.all([
      getSales(tenantSlug),
      getBranches(tenantSlug),
      getProducts(tenantSlug),
    ]);

    setBranches(branchesData);
    setProducts(productsData);
    setSalesRows(mapSalesRows(salesData, branchesData));
  }, [tenantSlug, mapSalesRows]);

  React.useEffect(() => {
    if (!tenantSlug) return;

    let cancelled = false;

    const load = async () => {
      try {
        await loadSalesData();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sales");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, branchKey, loadSalesData]);

  const formatMoney = (amount: number) =>
    `$${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const getStatusBadgeClass = (
    status: (typeof salesRows)[number]["status"],
  ) => {
    switch (status) {
      case "RECORDED":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 hover:bg-emerald-100";
      default:
        return "";
    }
  };

  const filteredSalesRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return salesRows;
    return salesRows.filter((r) => {
      const haystack = [r.id, r.receiptNumber, r.branchId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [salesRows, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSalesRows.length / pageSize),
  );

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  React.useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedSalesRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSalesRows.slice(start, start + pageSize);
  }, [filteredSalesRows, page]);

  const showingStart =
    filteredSalesRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredSalesRows.length);

  const dashboardStats = React.useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const rowsWithDate = salesRows
      .map((row) => ({
        row,
        date: row.saleDateIso ? new Date(row.saleDateIso) : null,
      }))
      .filter((entry) => entry.date && !Number.isNaN(entry.date.getTime())) as {
      row: SalesRow;
      date: Date;
    }[];

    const monthRows = rowsWithDate.filter(
      ({ date }) =>
        date.getMonth() === currentMonth && date.getFullYear() === currentYear,
    );
    const todayRows = rowsWithDate.filter(
      ({ date }) => date >= todayStart && date < tomorrowStart,
    );

    const totalSalesMtd = monthRows.reduce(
      (sum, { row }) => sum + row.totalAmount,
      0,
    );
    const todayRevenue = todayRows.reduce(
      (sum, { row }) => sum + row.totalAmount,
      0,
    );
    const averageTransaction =
      salesRows.length > 0
        ? salesRows.reduce((sum, row) => sum + row.totalAmount, 0) /
          salesRows.length
        : 0;

    const topBranchEntry = salesRows.reduce<Record<string, number>>(
      (acc, row) => {
        const key = row.branchId || "Unknown";
        acc[key] = (acc[key] ?? 0) + row.totalAmount;
        return acc;
      },
      {},
    );

    const topBranch =
      Object.entries(topBranchEntry).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return {
      totalSalesMtd,
      todayRevenue,
      averageTransaction,
      topBranch,
    };
  }, [salesRows]);

  const branchRevenueDistribution = React.useMemo(() => {
    const totalsByBranch = salesRows.reduce<Record<string, number>>(
      (acc, row) => {
        const key = row.branchId || "Unknown";
        acc[key] = (acc[key] ?? 0) + row.totalAmount;
        return acc;
      },
      {},
    );

    const overall = Object.values(totalsByBranch).reduce(
      (sum, v) => sum + v,
      0,
    );
    return Object.entries(totalsByBranch)
      .map(([branch, total]) => ({
        branch,
        total,
        percentage: overall > 0 ? Math.round((total / overall) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [salesRows]);

  const refreshData = React.useCallback(async () => {
    if (!tenantSlug) return;

    try {
      await loadSalesData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh sales");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, loadSalesData]);

  const openCreate = () => {
    setFormMode("create");
    setFormError(null);
    setActiveSale({
      id: "",
      receiptNumber: "",
      branchId: branches[0]?.id ?? "",
      productId: "",
      quantity: "1",
      unitPrice: "",
      totalAmount: "",
      discount: "0",
      tax: "0",
    });
    setFormOpen(true);
  };

  const openEdit = (row: SalesRow) => {
    setFormMode("edit");
    setFormError(null);
    setActiveSale({
      id: row.id,
      receiptNumber: row.receiptNumber,
      branchId: row.branchUuid ?? "",
      productId: "",
      quantity: "1",
      unitPrice: "",
      totalAmount: String(row.totalAmount),
      discount: row.discountAmount === null ? "0" : String(row.discountAmount),
      tax: String(row.taxAmount),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveSale(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !activeSale) return;

    const branchId = activeSale.branchId.trim();
    const totalAmountNum = Number(activeSale.totalAmount);
    const quantityNum = Number(activeSale.quantity);
    const unitPriceNum = Number(activeSale.unitPrice);
    const discountNum =
      activeSale.discount.trim() === "" ? 0 : Number(activeSale.discount);
    const taxNum = activeSale.tax.trim() === "" ? 0 : Number(activeSale.tax);

    if (!branchId) return setFormError("Select a branch.");
    if (!activeSale.productId) return setFormError("Select a product.");
    if (!Number.isFinite(quantityNum) || quantityNum <= 0)
      return setFormError("Quantity must be greater than 0.");
    if (!Number.isFinite(totalAmountNum))
      return setFormError("Total amount must be a valid number.");
    if (!Number.isFinite(discountNum))
      return setFormError("Discount must be a valid number.");
    if (!Number.isFinite(taxNum))
      return setFormError("Tax must be a valid number.");

    const payload = {
      branchId,
      totalAmount: totalAmountNum,
      discount: discountNum,
      tax: taxNum,
    };

    try {
      setSaving(true);
      setFormError(null);

      if (formMode === "create") {
        await createSale(tenantSlug, {
          ...payload,
          items: [
            {
              productId: activeSale.productId,
              quantity: quantityNum,
              price: Number.isFinite(unitPriceNum) ? unitPriceNum : undefined,
            },
          ],
        });
      } else {
        const updated = await updateSale(tenantSlug, activeSale.id, payload);
        if (!updated) {
          setFormError("Sale not found (it may have been deleted).");
          return;
        }
      }

      setFormOpen(false);
      setActiveSale(null);
      await refreshData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save sale");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (row: SalesRow) => {
    setDeleteCandidate(row);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;
    try {
      setDeletingId(deleteCandidate.id);
      await deleteSale(tenantSlug, deleteCandidate.id);
      setDeleteConfirmOpen(false);
      setDeleteCandidate(null);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sale");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ErpWorkbenchShell
      headerEnd={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={() =>
              openDrawer({
                title: "Create invoice",
                description:
                  "Draft in the drawer; your invoice list stays visible behind this panel.",
                content: <CreateInvoiceDrawerForm />,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Create invoice
          </Button>
          <Button
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={openCreate}
            disabled={!canCreate || loading}
          >
            <Plus className="h-4 w-4" />
            New sale
          </Button>
        </>
      }
    >
      <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Invoices</h1>
            <p className="text-sm text-muted-foreground">
              Review point-of-sale activity and sales as customer invoices.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="relative overflow-hidden border-primary/5">
            <CardContent className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                  <Wallet className="h-5 w-5" />
                </div>
                <Badge
                  className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100"
                  variant="secondary"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  MTD
                </Badge>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Total Sales (MTD)
              </p>
              <div className="mt-1 text-2xl font-extrabold">
                {formatMoney(dashboardStats.totalSalesMtd)}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/5">
            <CardContent className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <Badge
                  className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100"
                  variant="secondary"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Today
                </Badge>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Today&apos;s Revenue
              </p>
              <div className="mt-1 text-2xl font-extrabold">
                {formatMoney(dashboardStats.todayRevenue)}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/5">
            <CardContent className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                  <Calculator className="h-5 w-5" />
                </div>
                <Badge
                  className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100"
                  variant="secondary"
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  Live
                </Badge>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Average Transaction
              </p>
              <div className="mt-1 text-2xl font-extrabold">
                {formatMoney(dashboardStats.averageTransaction)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-primary/5">
          <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
            <h3 className="text-sm font-bold uppercase tracking-wide">
              Recent Transactions
            </h3>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sales..."
                  className="h-9 w-[220px] rounded-lg pl-9"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                onClick={() => setQuery("")}
                disabled={!query.trim()}
              >
                <Filter className="h-4 w-4" />
                <span className="sr-only">Reset</span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                disabled
                aria-disabled
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Download</span>
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6">Receipt #</TableHead>
                  <TableHead className="px-6">Branch</TableHead>
                  <TableHead className="px-6 text-right">
                    Total Amount
                  </TableHead>
                  <TableHead className="px-6">Discount/Tax</TableHead>
                  <TableHead className="px-6">Status</TableHead>
                  <TableHead className="px-6">Sale Date</TableHead>
                  <TableHead className="px-6 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pagedSalesRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-6 py-4">
                      <div className="font-mono text-sm font-semibold tabular-nums">
                        {row.receiptNumber}
                      </div>
                    </TableCell>

                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                      {row.branchId}
                    </TableCell>

                    <TableCell className="px-6 py-4 text-right font-bold text-foreground">
                      {formatMoney(row.totalAmount)}
                    </TableCell>

                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        {row.discountAmount != null ? (
                          <span className="text-[10px] text-destructive">
                            -${row.discountAmount.toFixed(2)} Discount
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            No Discount
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          +${row.taxAmount.toFixed(2)} Tax
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="px-6 py-4">
                      <Badge
                        className={getStatusBadgeClass(row.status)}
                        variant="secondary"
                      >
                        {row.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                      {row.saleDate}
                    </TableCell>

                    <TableCell className="px-6 py-4 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-background"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => openEdit(row)}>
                            <Receipt className="h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openEdit(row)}>
                            <Edit2 className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => requestDelete(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground tracking-tight">
              Showing {showingStart} to {showingEnd} of{" "}
              {filteredSalesRows.length} sales
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-border text-muted-foreground hover:border-primary hover:text-primary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous</span>
              </Button>

              {(() => {
                const show = 5;
                let start = Math.max(1, page - Math.floor(show / 2));
                const end = Math.min(totalPages, start + show - 1);
                if (end - start + 1 < show) {
                  start = Math.max(1, end - show + 1);
                }

                return Array.from(
                  { length: end - start + 1 },
                  (_, i) => start + i,
                ).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 rounded-lg text-xs font-medium"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ));
              })()}

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-border text-muted-foreground hover:border-primary hover:text-primary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next</span>
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-primary/5 shadow-sm">
            <CardContent className="px-6 py-6">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6">
                Branch Revenue Share
              </h3>
              {branchRevenueDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sales data yet.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {branchRevenueDistribution.map((entry) => (
                    <div key={entry.branch} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-muted-foreground">
                          {entry.branch}
                        </span>
                        <span className="text-primary">
                          {entry.percentage}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${entry.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-primary/5 relative overflow-hidden">
            <CardContent className="px-6 py-6 relative z-10 flex flex-col justify-between h-full">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-2">
                  Automated Report
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                  Sales totals are generated from live records. Top performing
                  branch is{" "}
                  <span className="font-bold text-foreground">
                    {dashboardStats.topBranch}
                  </span>
                  .
                </p>
              </div>

              <Button className="mt-4 w-fit bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary/20">
                View Detailed Insights
              </Button>
            </CardContent>

            <Lightbulb className="absolute -right-8 -bottom-8 h-40 w-40 text-primary/10" />
          </Card>
        </div>
      </main>

      <Sheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
          else setFormOpen(true);
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          <form onSubmit={handleSubmit} className="flex h-full flex-col">
            <SheetHeader className="border-b">
              <SheetTitle>
                {formMode === "create" ? "New sale" : "Edit sale"}
              </SheetTitle>
              <SheetDescription>
                Sales transaction details and totals.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {formError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              ) : null}

              {!activeSale ? (
                <p className="text-sm text-muted-foreground">
                  No sale selected.
                </p>
              ) : (
                <>
                  {formMode === "edit" ? (
                    <div className="space-y-2">
                      <Label>Receipt #</Label>
                      <Input
                        readOnly
                        className="font-mono tabular-nums bg-muted/40"
                        value={
                          activeSale.receiptNumber === "—"
                            ? ""
                            : activeSale.receiptNumber
                        }
                        placeholder="—"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Receipt number is assigned automatically when you create
                      the sale.
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select
                      value={activeSale.branchId}
                      onValueChange={(v) =>
                        setActiveSale((prev) =>
                          prev ? { ...prev, branchId: v } : prev,
                        )
                      }
                    >
                      <SelectTrigger className="w-full rounded-lg">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name ?? "Unnamed branch"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select
                      value={activeSale.productId}
                      onValueChange={(v) =>
                        setActiveSale((prev) =>
                          prev ? { ...prev, productId: v } : prev,
                        )
                      }
                    >
                      <SelectTrigger className="w-full rounded-lg">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="sale-quantity">Quantity</Label>
                      <Input
                        id="sale-quantity"
                        type="number"
                        min={1}
                        step={1}
                        value={activeSale.quantity}
                        onChange={(e) =>
                          setActiveSale((prev) =>
                            prev ? { ...prev, quantity: e.target.value } : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sale-unit-price">Unit price</Label>
                      <Input
                        id="sale-unit-price"
                        type="number"
                        min={0}
                        step={0.01}
                        value={activeSale.unitPrice}
                        onChange={(e) =>
                          setActiveSale((prev) =>
                            prev
                              ? { ...prev, unitPrice: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sale-total">Total amount</Label>
                    <Input
                      id="sale-total"
                      type="number"
                      min={0}
                      step={0.01}
                      value={activeSale.totalAmount}
                      onChange={(e) =>
                        setActiveSale((prev) =>
                          prev
                            ? { ...prev, totalAmount: e.target.value }
                            : prev,
                        )
                      }
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sale-discount">Discount</Label>
                    <Input
                      id="sale-discount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={activeSale.discount}
                      onChange={(e) =>
                        setActiveSale((prev) =>
                          prev ? { ...prev, discount: e.target.value } : prev,
                        )
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sale-tax">Tax</Label>
                    <Input
                      id="sale-tax"
                      type="number"
                      min={0}
                      step={0.01}
                      value={activeSale.tax}
                      onChange={(e) =>
                        setActiveSale((prev) =>
                          prev ? { ...prev, tax: e.target.value } : prev,
                        )
                      }
                      placeholder="0.00"
                    />
                  </div>

                  {formMode === "edit" && activeSale.id ? (
                    <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Editing sale:{" "}
                      <span className="font-mono">{activeSale.id}</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <SheetFooter className="border-t">
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    saving ||
                    !activeSale ||
                    !activeSale.branchId ||
                    !activeSale.totalAmount
                  }
                  className="rounded-lg"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {formMode === "create" ? "Create sale" : "Save changes"}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteCandidate(null);
        }}
      >
        <SheetContent side="bottom" className="sm:max-w-none">
          <SheetHeader className="border-b">
            <SheetTitle>Delete sale</SheetTitle>
            <SheetDescription>This action cannot be undone.</SheetDescription>
          </SheetHeader>

          <div className="p-4">
            {deleteCandidate ? (
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm font-semibold font-mono tabular-nums">
                  Receipt #{deleteCandidate.receiptNumber}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {deleteCandidate.id}
                </p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="block text-xs font-medium">Branch</span>
                    <span>{deleteCandidate.branchId}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium">Sale date</span>
                    <span>{deleteCandidate.saleDate}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter className="border-t">
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteCandidate(null);
                }}
                disabled={!!deletingId}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={!deleteCandidate || !!deletingId}
              >
                {deletingId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Delete sale
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ErpWorkbenchShell>
  );
}
