"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Edit2,
  Plus,
  PlusCircle,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getStoredUser } from "@/lib/auth-client";
import {
  createPatientLoan,
  addPatientLoanPayment,
  deletePatientLoan,
  getCustomers,
  getPatientLoans,
  getPatientLoansPaged,
  getPatientLoanPayments,
  updatePatientLoan,
  type Customer,
  type PatientLoan,
} from "@/lib/api";

type LoanStatus = "ongoing" | "paid" | "overdue";

type LoanRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  customerCode: string;
  totalAmount: number;
  amountPaid: number;
  dueDate: string; // ISO string
  status: LoanStatus;
};

const money = (amount: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(iso));

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
};

function StatusBadge({ status }: { status: LoanStatus }) {
  if (status === "paid") {
    return (
      <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
        Paid
      </Badge>
    );
  }
  if (status === "overdue") {
    return (
      <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
        Overdue
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
      Ongoing
    </Badge>
  );
}

export default function PatientLoansPage() {
  const [loans, setLoans] = useState<LoanRow[]>([]);
  /** Full list for KPI cards (same filters as status pills). */
  const [kpiLoans, setKpiLoans] = useState<LoanRow[]>([]);
  const [loanTotalCount, setLoanTotalCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);

  const [formCustomer, setFormCustomer] = useState<string>("");
  const [formTotalAmount, setFormTotalAmount] = useState<string>("");
  const [formInitialPayment, setFormInitialPayment] = useState<string>("");
  const [formDueDate, setFormDueDate] = useState<Date | undefined>(undefined);
  const [formStatus, setFormStatus] = useState<LoanStatus>("ongoing");
  const [formNotes, setFormNotes] = useState<string>("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<LoanRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentLoan, setPaymentLoan] = useState<LoanRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Used for KPI cards: sum of payments with payment_date == today per loan.
  const [paymentsTodayByLoanId, setPaymentsTodayByLoanId] = useState<
    Record<string, number>
  >({});

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ongoing" | "paid" | "overdue"
  >("all");
  const [sortBy, setSortBy] = useState<"newest" | "amount" | "dueDate">(
    "newest",
  );
  const [page, setPage] = useState(1);

  const pageSize = 8;
  const [tenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [branchKey, setBranchKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("branchId");
    if (!v || v === "all") return null;
    return v;
  });

  // Refetch branch-scoped data when the sidebar location changes.
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as {
        branchId?: string | null;
      };
      setBranchKey(detail?.branchId ?? null);
    };
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);

  const refreshLoans = useCallback(async () => {
    const toNumber = (v: number | string | null | undefined) => {
      if (v === null || v === undefined) return 0;
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? n : 0;
    };
    const mapStatus = (s: string | null | undefined): LoanStatus => {
      if (s === "paid" || s === "overdue" || s === "ongoing") return s;
      return "ongoing";
    };

    const mapLoanRow = (l: PatientLoan): LoanRow => ({
      id: l.id,
      customerId: l.customer_id ?? null,
      customerName: l.customer_name ?? "Unnamed customer",
      customerCode: l.customer_id
        ? `CUST-${l.customer_id.slice(0, 8)}`
        : "CUST-—",
      totalAmount: toNumber(l.total_amount),
      amountPaid: toNumber(l.amount_paid),
      dueDate: l.due_date ?? new Date().toISOString().slice(0, 10),
      status: mapStatus(l.status),
    });

    const apiStatus =
      statusFilter === "all" ? undefined : statusFilter;

    const [pageRes, kpiData, customersData] = await Promise.all([
      getPatientLoansPaged(
        tenantSlug,
        page,
        pageSize,
        apiStatus,
      ),
      getPatientLoans(tenantSlug, apiStatus),
      getCustomers(tenantSlug),
    ]);

    setCustomerOptions(customersData);
    setLoans(pageRes.items.map(mapLoanRow));
    setLoanTotalCount(pageRes.total);
    setKpiLoans(kpiData.map(mapLoanRow));

    // Compute KPI "Collected today" from backend payments (scoped loans for KPI).
    const todayKey = new Date().toISOString().slice(0, 10);
    setPaymentsTodayByLoanId({});
    try {
      const kpiRows = kpiData.map(mapLoanRow);
      const entries = await Promise.all(
        kpiRows.map(async (loan) => {
          const payments = await getPatientLoanPayments(tenantSlug, loan.id);

          const sum = payments.reduce((acc, p) => {
            const paymentDay = p.payment_date
              ? p.payment_date.slice(0, 10)
              : null;
            if (!paymentDay || paymentDay !== todayKey) return acc;

            const amount = toNumber(p.amount);
            return acc + amount;
          }, 0);

          return [loan.id, sum] as const;
        }),
      );

      setPaymentsTodayByLoanId(Object.fromEntries(entries));
    } catch {
      setPaymentsTodayByLoanId({});
    }
  }, [tenantSlug, page, pageSize, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    void refreshLoans().catch(() => {
      // keep state as-is (empty) if API is unreachable
    });
  }, [refreshLoans, branchKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = loans.slice();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) ||
          r.customerCode.toLowerCase().includes(q),
      );
    }

    rows.sort((a, b) => {
      if (sortBy === "amount") return b.totalAmount - a.totalAmount;
      if (sortBy === "dueDate")
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
    });

    return rows;
  }, [loans, query, sortBy]);

  const totals = useMemo(() => {
    const outstanding = kpiLoans
      .filter((r) => r.status !== "paid")
      .reduce((sum, r) => sum + (r.totalAmount - r.amountPaid), 0);
    const overdue = kpiLoans
      .filter((r) => r.status === "overdue")
      .reduce((sum, r) => sum + (r.totalAmount - r.amountPaid), 0);
    const collectedToday = kpiLoans.reduce(
      (sum, r) => sum + (paymentsTodayByLoanId[r.id] ?? 0),
      0,
    );
    const customers = new Set(kpiLoans.map((r) => r.customerName)).size;
    return { outstanding, overdue, collectedToday, customers };
  }, [kpiLoans, paymentsTodayByLoanId]);

  const totalPages = Math.max(1, Math.ceil(loanTotalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered;
  const rangeStart =
    loanTotalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, loanTotalCount);

  const openCreate = () => {
    setFormMode("create");
    setActiveLoanId(null);
    setCreateError(null);
    setFormCustomer("");
    setFormTotalAmount("");
    setFormInitialPayment("");
    setFormDueDate(undefined);
    setFormStatus("ongoing");
    setFormNotes("");
    setCreateOpen(true);
  };

  const openEdit = (loan: LoanRow) => {
    setCreateError(null);
    setFormMode("edit");
    setActiveLoanId(loan.id);

    setFormCustomer(loan.customerId ?? "");
    setFormTotalAmount(String(loan.totalAmount));
    setFormInitialPayment(String(loan.amountPaid));

    const parsedDue = loan.dueDate ? new Date(loan.dueDate) : undefined;
    setFormDueDate(
      parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : undefined,
    );

    setFormStatus(loan.status);
    setFormNotes("");
    setCreateOpen(true);
  };

  const requestDelete = (loan: LoanRow) => {
    setDeleteError(null);
    setDeleteCandidate(loan);
    setDeletingId(null);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;
    try {
      setDeletingId(deleteCandidate.id);
      setDeleteError(null);
      await deletePatientLoan(tenantSlug, deleteCandidate.id);
      await refreshLoans();
      setDeleteOpen(false);
      setDeleteCandidate(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete loan",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const openPayment = (loan: LoanRow) => {
    setPaymentError(null);
    setPaymentLoan(loan);
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentSaving(false);
    setPaymentOpen(true);
  };

  const submitPayment = async () => {
    if (!tenantSlug || !paymentLoan) return;
    const amountNum = Number(paymentAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }

    try {
      setPaymentSaving(true);
      setPaymentError(null);
      await addPatientLoanPayment(tenantSlug, paymentLoan.id, {
        amount: amountNum,
        paymentMethod: paymentMethod.trim() || undefined,
      });
      await refreshLoans();
      setPaymentOpen(false);
      setPaymentLoan(null);
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Failed to add payment",
      );
    } finally {
      setPaymentSaving(false);
    }
  };

  const createLoan = () => {
    const total = Number(formTotalAmount);
    const initial = Number(formInitialPayment || 0);
    if (formMode === "create" && !formCustomer) {
      setCreateError("Please select a customer.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setCreateError("Total loan amount must be greater than 0.");
      return;
    }
    if (!Number.isFinite(initial) || initial < 0) {
      setCreateError("Initial payment must be a valid number.");
      return;
    }
    if (formMode === "create" && initial > total) {
      setCreateError("Initial payment can’t be greater than total amount.");
      return;
    }

    const dueDateIso = formDueDate
      ? formDueDate.toISOString().slice(0, 10)
      : undefined;

    const computedStatus: LoanStatus =
      initial >= total ? "paid" : (formStatus ?? "ongoing");

    void (async () => {
      try {
        if (formMode === "create") {
          await createPatientLoan(tenantSlug, {
            customerId: formCustomer,
            totalAmount: total,
            amountPaid: initial,
            status: computedStatus,
            dueDate: dueDateIso,
          });
        } else {
          if (!activeLoanId) {
            setCreateError("No loan selected to update.");
            return;
          }
          const updated = await updatePatientLoan(tenantSlug, activeLoanId, {
            totalAmount: total,
            status: computedStatus,
            dueDate: dueDateIso,
          });
          if (!updated) {
            setCreateError("Loan not found (it may have been deleted).");
            return;
          }
        }

        await refreshLoans();
        setCreateOpen(false);
        setCreateError(null);
        setPage(1);
        setQuery("");
        setStatusFilter("all");
        setSortBy("newest");
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : "Failed to save loan",
        );
      }
    })();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md md:px-6">
        <div className="flex-1" />

        <div className="hidden w-[18rem] md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="Search records..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="gap-1.5 rounded-full"
            size="sm"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            New loan
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Patient loans
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage and track patient loan applications, repayments, and
              outstanding balances.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
            <div className="relative w-full md:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setPage(1);
                  setQuery(e.target.value);
                }}
                placeholder="Search records..."
                className="pl-9"
              />
            </div>
            <Button className="gap-2 md:hidden" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New loan
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                +5.2%
              </Badge>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-sm text-muted-foreground">Total outstanding</p>
              <p className="mt-1 text-2xl font-semibold">
                {money(totals.outstanding)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
                -2.1%
              </Badge>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-sm text-muted-foreground">Overdue balance</p>
              <p className="mt-1 text-2xl font-semibold">
                {money(totals.overdue)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <PlusCircle className="h-5 w-5" />
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                +12%
              </Badge>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-sm text-muted-foreground">Collected today</p>
              <p className="mt-1 text-2xl font-semibold">
                {money(totals.collectedToday)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                +3%
              </Badge>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-sm text-muted-foreground">
                Total loan customers
              </p>
              <p className="mt-1 text-2xl font-semibold">{totals.customers}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={statusFilter === "all" ? "default" : "secondary"}
                  onClick={() => {
                    setPage(1);
                    setStatusFilter("all");
                  }}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "ongoing" ? "default" : "secondary"}
                  onClick={() => {
                    setPage(1);
                    setStatusFilter("ongoing");
                  }}
                >
                  Ongoing
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "paid" ? "default" : "secondary"}
                  onClick={() => {
                    setPage(1);
                    setStatusFilter("paid");
                  }}
                >
                  Paid
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "overdue" ? "default" : "secondary"}
                  onClick={() => {
                    setPage(1);
                    setStatusFilter("overdue");
                  }}
                >
                  Overdue
                </Button>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Select
                  value={sortBy}
                  onValueChange={(v) => {
                    setPage(1);
                    setSortBy(v as typeof sortBy);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Sort by: Newest</SelectItem>
                    <SelectItem value="amount">Sort by: Amount</SelectItem>
                    <SelectItem value="dueDate">Sort by: Due date</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                  <span className="sr-only">Filters</span>
                </Button>
              </div>
            </div>
            <CardDescription className="mt-3">
              Page is styled with shadcn UI components (demo data for now).
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[280px]">Customer</TableHead>
                    <TableHead>Total amount</TableHead>
                    <TableHead>Amount paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center">
                        <p className="text-sm text-muted-foreground">
                          No loans found.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((row, idx) => {
                      const balance = row.totalAmount - row.amountPaid;
                      const initials = getInitials(row.customerName);
                      const avatarTone =
                        row.status === "overdue"
                          ? "bg-destructive/10 text-destructive"
                          : row.status === "paid"
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/10 text-primary";
                      return (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${avatarTone}`}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {row.customerName}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  ID: {row.customerCode}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {money(row.totalAmount)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {money(row.amountPaid)}
                          </TableCell>
                          <TableCell
                            className={
                              row.status === "overdue"
                                ? "text-sm font-semibold text-destructive"
                                : balance > 0
                                  ? "text-sm font-semibold text-primary"
                                  : "text-sm font-semibold"
                            }
                          >
                            {money(balance)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(row.dueDate)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Edit loan"
                                onClick={() => {
                                  openEdit(row);
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Add payment"
                                onClick={() => {
                                  openPayment(row);
                                }}
                              >
                                <PlusCircle className="h-4 w-4" />
                                <span className="sr-only">Add payment</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Delete loan"
                                onClick={() => requestDelete(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {rangeStart} to {rangeEnd} of {loanTotalCount} loans
                {query.trim()
                  ? " (search applies to the current page only)"
                  : ""}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous page</span>
                </Button>
                {Array.from({ length: Math.min(3, totalPages) }).map((_, i) => {
                  const n = i + 1;
                  const isActive = n === safePage;
                  return (
                    <Button
                      key={n}
                      variant={isActive ? "default" : "outline"}
                      className="h-9 w-9 px-0"
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next page</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="right" className="sm:max-w-lg">
            <SheetHeader className="gap-1">
              <SheetTitle>
                {formMode === "create"
                  ? "Create new patient loan"
                  : "Edit patient loan"}
              </SheetTitle>
              <SheetDescription>
                {formMode === "create"
                  ? "Fill in the details to issue a new medical loan."
                  : "Update the loan amount, status, and due date."}
              </SheetDescription>
              {createError ? (
                <p className="text-sm text-destructive">{createError}</p>
              ) : null}
            </SheetHeader>

            <div className="space-y-5 px-4 pb-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Customer select
                </Label>
                <Select
                  value={formCustomer}
                  onValueChange={setFormCustomer}
                  disabled={formMode === "edit"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customerOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name ?? "Unnamed customer"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total loan amount
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="pl-7"
                      value={formTotalAmount}
                      onChange={(e) => setFormTotalAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Initial payment
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00 (Optional)"
                      className="pl-7"
                      value={formInitialPayment}
                      onChange={(e) => setFormInitialPayment(e.target.value)}
                      disabled={formMode === "edit"}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Due date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2 font-normal"
                      >
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        {formDueDate ? (
                          <span>{formatDate(formDueDate.toISOString())}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Pick a date
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formDueDate}
                        onSelect={(d) => setFormDueDate(d ?? undefined)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </Label>
                  <Select
                    value={formStatus}
                    onValueChange={(v) => setFormStatus(v as LoanStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notes
                  </Label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={3}
                    placeholder="Additional information about the loan..."
                    disabled={formMode === "edit"}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <SheetFooter className="gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createLoan}>
                {formMode === "create" ? "Create loan" : "Save changes"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Sheet
          open={paymentOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPaymentOpen(false);
              setPaymentLoan(null);
            } else {
              setPaymentOpen(true);
            }
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <SheetHeader className="gap-1">
              <SheetTitle>Add payment</SheetTitle>
              <SheetDescription>
                Record a repayment for this patient loan.
              </SheetDescription>
              {paymentError ? (
                <p className="text-sm text-destructive">{paymentError}</p>
              ) : null}
            </SheetHeader>

            <div className="space-y-5 px-4 pb-2">
              {!paymentLoan ? (
                <p className="text-sm text-muted-foreground">
                  No loan selected.
                </p>
              ) : (
                <>
                  <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Loan for{" "}
                    <span className="font-semibold">
                      {paymentLoan.customerName}
                    </span>
                    <div className="mt-1">
                      Balance:{" "}
                      <span className="font-semibold">
                        {money(
                          paymentLoan.totalAmount - paymentLoan.amountPaid,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Amount</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment-method">
                      Payment method (optional)
                    </Label>
                    <Input
                      id="payment-method"
                      placeholder="e.g. cash, card"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <SheetFooter className="gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setPaymentOpen(false);
                  setPaymentLoan(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitPayment()}
                disabled={!paymentLoan || paymentSaving}
              >
                {paymentSaving ? "Saving..." : "Add payment"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Sheet
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteOpen(false);
              setDeleteCandidate(null);
            } else {
              setDeleteOpen(true);
            }
          }}
        >
          <SheetContent side="bottom" className="sm:max-w-none">
            <SheetHeader className="border-b">
              <SheetTitle>Delete patient loan</SheetTitle>
              <SheetDescription>This action cannot be undone.</SheetDescription>
            </SheetHeader>

            <div className="p-4">
              {deleteCandidate ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-semibold">
                    {deleteCandidate.customerName}
                  </p>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Total:{" "}
                    <span className="font-medium">
                      {money(deleteCandidate.totalAmount)}
                    </span>
                    <br />
                    Paid:{" "}
                    <span className="font-medium">
                      {money(deleteCandidate.amountPaid)}
                    </span>
                    <br />
                    Balance:{" "}
                    <span className="font-medium">
                      {money(
                        deleteCandidate.totalAmount -
                          deleteCandidate.amountPaid,
                      )}
                    </span>
                  </div>
                </div>
              ) : null}
              {deleteError ? (
                <p className="mt-3 text-sm text-destructive">{deleteError}</p>
              ) : null}
            </div>

            <SheetFooter className="border-t">
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteCandidate(null);
                  }}
                  disabled={!!deletingId}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void confirmDelete()}
                  disabled={!deleteCandidate || !!deletingId}
                >
                  {deletingId ? "Deleting..." : "Delete loan"}
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}
