"use client";

import * as React from "react";
import {
  CalendarDays,
  Download,
  Edit2,
  Eye,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users2,
  TrendingUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  UserPlus,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Separator } from "@repo/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";

import { getStoredUser } from "@/lib/auth-client";
import {
  createCustomer,
  deleteCustomer,
  getCustomers,
  updateCustomer,
  type Customer,
} from "@/lib/api";

type FormMode = "create" | "edit" | "view";

type EditableCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string;
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function initialsFor(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase()).filter(Boolean);
  return letters.join("") || "CU";
}

export default function CustomersPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const pageSize = 8;
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("create");
  const [activeCustomer, setActiveCustomer] =
    React.useState<EditableCustomer | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<Customer | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!tenantSlug) return;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getCustomers(tenantSlug);
        if (cancelled) return;
        setCustomers(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load customers",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const refresh = React.useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getCustomers(tenantSlug);
      setCustomers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh customers",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  const filteredCustomers = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;

    return [...customers].filter((c) => {
      const haystack = [c.id, c.name, c.phone, c.address, c.created_at]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [customers, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / pageSize),
  );

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  React.useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedCustomers = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, page]);

  const showingStart =
    filteredCustomers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredCustomers.length);

  const canCreate = true;

  const openCreate = () => {
    setFormMode("create");
    setFormError(null);
    setActiveCustomer({
      id: "",
      name: "",
      phone: "",
      address: "",
    });
    setFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setFormMode("edit");
    setFormError(null);
    setActiveCustomer({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
    });
    setFormOpen(true);
  };

  const openView = (c: Customer) => {
    setFormMode("view");
    setFormError(null);
    setActiveCustomer({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveCustomer(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !activeCustomer) return;
    if (formMode === "view") {
      closeForm();
      return;
    }

    const name = activeCustomer.name.trim();
    const phone = activeCustomer.phone.trim();
    const address = activeCustomer.address.trim();

    if (!name) {
      setFormError("Customer name is required.");
      return;
    }

    const payload = {
      name,
      phone: phone.length ? phone : undefined,
      address: address.length ? address : undefined,
    };

    try {
      setSaving(true);
      setFormError(null);

      if (formMode === "create") {
        const created = await createCustomer(tenantSlug, payload);
        setCustomers((prev) => [created, ...prev]);
      } else {
        const updated = await updateCustomer(
          tenantSlug,
          activeCustomer.id,
          payload,
        );
        if (!updated) {
          setFormError("Customer not found (it may have been deleted).");
          return;
        }
        setCustomers((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x)),
        );
      }

      setFormOpen(false);
      setActiveCustomer(null);
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save customer",
      );
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (c: Customer) => {
    setDeleteCandidate(c);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;

    try {
      setDeletingId(deleteCandidate.id);
      await deleteCustomer(tenantSlug, deleteCandidate.id);
      setDeleteConfirmOpen(false);
      setDeleteCandidate(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete customer",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const totalCustomers = customers.length;
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newPatientsThisMonth = customers.filter((c) => {
    if (!c.created_at) return false;
    const d = new Date(c.created_at);
    return !Number.isNaN(d.getTime()) && d >= startOfThisMonth;
  }).length;
  const activeAccounts = totalCustomers
    ? customers.filter((c) => !!(c.phone || c.address)).length
    : 0;
  const activeAccountsPercent = totalCustomers
    ? (activeAccounts / totalCustomers) * 100
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
        <div className="flex flex-1 items-center gap-2">
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Customers</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <Button
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={openCreate}
          disabled={!canCreate || loading}
        >
          <Plus className="h-4 w-4" />
          New customer
        </Button>
      </header>

      <main className="space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Customer Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage patient and customer records linked to sales.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="relative overflow-hidden border-primary/5">
            <CardContent className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                  <Users2 className="h-5 w-5" />
                </div>
                <Badge
                  className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100"
                  variant="secondary"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  +12%
                </Badge>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Total Customers
              </p>
              <div className="mt-1 text-2xl font-extrabold">
                {totalCustomers.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/5">
            <CardContent className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                  <UserPlus className="h-5 w-5" />
                </div>
                <Badge
                  className="bg-primary/10 text-primary border-0 hover:bg-primary/20"
                  variant="secondary"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Monthly
                </Badge>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                New Patients This Month
              </p>
              <div className="mt-1 text-2xl font-extrabold">
                {newPatientsThisMonth.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/5">
            <CardContent className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <Badge
                  className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100"
                  variant="secondary"
                >
                  {activeAccountsPercent.toFixed(1)}%
                </Badge>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Active Accounts
              </p>
              <div className="mt-1 text-2xl font-extrabold">
                {activeAccounts.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Card className="overflow-hidden border-primary/5">
          <CardHeader className="border-b bg-muted/30 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-6 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-lg">
                    Recent Patient Directory
                  </CardTitle>
                  <CardDescription>
                    Backed by{" "}
                    <code className="font-mono text-xs">/api/customers</code>{" "}
                    with <code className="font-mono text-xs">X-Tenant</code>.
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative hidden sm:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search customers..."
                    className="h-9 w-[240px] rounded-lg pl-9"
                  />
                </div>

                <Button
                  variant="outline"
                  className="hidden sm:inline-flex"
                  disabled
                  aria-disabled
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>

                <Button
                  variant="outline"
                  className="hidden sm:inline-flex"
                  disabled
                  aria-disabled
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>

                {query.trim() ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQuery("")}
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="relative sm:hidden mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers..."
                className="h-10 w-full rounded-xl pl-9"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading customers…
              </div>
            ) : pagedCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center text-sm text-muted-foreground">
                <p>No customers found.</p>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add first customer
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground px-6">
                          Customer Name
                        </TableHead>
                        <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground px-6">
                          Phone
                        </TableHead>
                        <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground px-6">
                          Address
                        </TableHead>
                        <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground px-6">
                          Created At
                        </TableHead>
                        <TableHead className="w-28 text-right font-semibold uppercase tracking-wider text-primary px-6">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedCustomers.map((c) => (
                        <TableRow
                          key={c.id}
                          className="hover:bg-primary/5 transition-colors"
                        >
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                {initialsFor(c.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">
                                  {c.name ?? "Unnamed customer"}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-medium truncate">
                                  ID:{" "}
                                  {c.id.length > 10 ? c.id.slice(0, 10) : c.id}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                            {c.phone ?? "—"}
                          </TableCell>

                          <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                            {c.address ?? "—"}
                          </TableCell>

                          <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                            {formatDate(c.created_at)}
                          </TableCell>

                          <TableCell className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => openEdit(c)}
                              >
                                <Edit2 className="h-4 w-4" />
                                <span className="sr-only">Edit customer</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => openView(c)}
                              >
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">View customer</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => requestDelete(c)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete customer</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground tracking-tight">
                    Showing {showingStart} to {showingEnd} of{" "}
                    {filteredCustomers.length} customers
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
                      let end = Math.min(totalPages, start + show - 1);
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
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                      <span className="sr-only">Next</span>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
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
                {formMode === "create"
                  ? "Add customer"
                  : formMode === "edit"
                    ? "Edit customer"
                    : "View customer"}
              </SheetTitle>
              <SheetDescription>
                {formMode === "view"
                  ? "Read-only customer details."
                  : "Create or update the customer record."}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {!activeCustomer ? (
                <p className="text-sm text-muted-foreground">
                  No customer selected.
                </p>
              ) : (
                <>
                  {formError ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {formError}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="customer-name">Name</Label>
                    <Input
                      id="customer-name"
                      value={activeCustomer.name}
                      onChange={(e) =>
                        setActiveCustomer((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev,
                        )
                      }
                      placeholder="e.g. Jane Doe"
                      required
                      disabled={formMode === "view" || saving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-phone">Phone</Label>
                    <Input
                      id="customer-phone"
                      value={activeCustomer.phone}
                      onChange={(e) =>
                        setActiveCustomer((prev) =>
                          prev ? { ...prev, phone: e.target.value } : prev,
                        )
                      }
                      placeholder="e.g. +1 555 010 1044"
                      disabled={formMode === "view" || saving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-address">Address</Label>
                    <Input
                      id="customer-address"
                      value={activeCustomer.address}
                      onChange={(e) =>
                        setActiveCustomer((prev) =>
                          prev ? { ...prev, address: e.target.value } : prev,
                        )
                      }
                      placeholder="Street, city, country"
                      disabled={formMode === "view" || saving}
                    />
                  </div>
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
                  {formMode === "view" ? "Close" : "Cancel"}
                </Button>

                {formMode !== "view" ? (
                  <Button
                    type="submit"
                    disabled={
                      saving ||
                      !activeCustomer ||
                      activeCustomer.name.trim().length === 0
                    }
                    className="rounded-lg"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {formMode === "create" ? "Create customer" : "Save changes"}
                  </Button>
                ) : null}
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
            <SheetTitle>Delete customer</SheetTitle>
            <SheetDescription>This action cannot be undone.</SheetDescription>
          </SheetHeader>

          <div className="p-4">
            {deleteCandidate ? (
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm font-semibold">
                  {deleteCandidate.name ?? "Unnamed customer"}
                </p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="block text-xs font-medium">Phone</span>
                    <span>{deleteCandidate.phone ?? "—"}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium">Address</span>
                    <span>{deleteCandidate.address ?? "—"}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium">Created</span>
                    <span>{formatDate(deleteCandidate.created_at)}</span>
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
                Delete customer
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
