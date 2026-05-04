"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Warehouse,
  Users2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createBranch,
  deleteBranch,
  getBranches,
  getInventory,
  getStaff,
  updateBranch,
  type Branch,
  type InventoryEntry,
  type StaffMember,
} from "@/lib/api";

type FormMode = "create" | "edit";

type EditableBranch = {
  id: string;
  name: string;
  phone: string;
  address: string;
  /** YYYY-MM-DD or empty to clear lock (edit only) */
  accountingLockDate: string;
};

type BranchStockSummary = {
  stockPercent: number; // 0..100
  active: boolean;
  lowAlert: boolean;
  totalEntries: number;
  lowEntries: number;
};

function computeBranchStock(entries: InventoryEntry[]): BranchStockSummary {
  const totalEntries = entries.length;
  if (totalEntries === 0) {
    return {
      stockPercent: 0,
      active: false,
      lowAlert: false,
      totalEntries: 0,
      lowEntries: 0,
    };
  }

  const lowEntries = entries.filter((e) => (e.quantity ?? 0) <= e.reorder_level).length;
  const active = entries.some((e) => (e.quantity ?? 0) > 0);
  const lowAlert = lowEntries > 0;

  const safeEntries = totalEntries - lowEntries;
  const stockPercent = Math.round((safeEntries / totalEntries) * 100);

  return { stockPercent, active, lowAlert, totalEntries, lowEntries };
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "danger";
}) {
  const iconTone =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-emerald-500/10 text-emerald-600"
        : tone === "warning"
          ? "bg-amber-500/10 text-amber-700"
          : "bg-rose-500/10 text-rose-700";

  const valueTone =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-rose-600 dark:text-rose-400"
          : "";

  return (
    <Card className="rounded-2xl ring-1 ring-foreground/10">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <div className={`rounded-lg p-2 ${iconTone}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={`text-2xl font-semibold ${valueTone}`}>{value}</div>
        <p className="text-xs font-medium text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function BranchesPage() {
  const [tenantSlug] = useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const pageSize = 4;
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeBranch, setActiveBranch] = useState<EditableBranch | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewBranch, setViewBranch] = useState<Branch | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Branch | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [branchesData, inventoryData, staffData] = await Promise.all([
          getBranches(tenantSlug),
          getInventory(tenantSlug),
          getStaff(tenantSlug),
        ]);
        if (cancelled) return;
        setBranches(branchesData);
        setInventory(inventoryData);
        setStaff(staffData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load branches",
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

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...branches].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, {
        sensitivity: "base",
      }),
    );

    if (!q) return sorted;

    return sorted.filter((b) => {
      const haystack = [b.name, b.phone, b.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [branches, query]);

  const inventoryByBranchId = useMemo(() => {
    const map = new Map<string, InventoryEntry[]>();
    for (const inv of inventory) {
      if (!inv.branch_id) continue;
      const arr = map.get(inv.branch_id);
      if (arr) arr.push(inv);
      else map.set(inv.branch_id, [inv]);
    }
    return map;
  }, [inventory]);

  const stockSummaryByBranchId = useMemo(() => {
    const map = new Map<string, BranchStockSummary>();
    for (const b of branches) {
      const entries = inventoryByBranchId.get(b.id) ?? [];
      map.set(b.id, computeBranchStock(entries));
    }
    return map;
  }, [branches, inventoryByBranchId]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredBranches.length / pageSize),
  );

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedBranches = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBranches.slice(start, start + pageSize);
  }, [filteredBranches, page]);

  const showingStart =
    filteredBranches.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredBranches.length);

  const stats = useMemo(() => {
    const total = branches.length;
    const activeStatus = branches.filter(
      (b) => Boolean(stockSummaryByBranchId.get(b.id)?.active),
    ).length;
    const lowStockAlerts = branches.filter(
      (b) => Boolean(stockSummaryByBranchId.get(b.id)?.lowAlert),
    ).length;
    const totalStaff = staff.length;
    return { total, activeStatus, lowStockAlerts, totalStaff };
  }, [branches, stockSummaryByBranchId, staff]);

  const openCreate = () => {
    setFormMode("create");
    setActiveBranch({
      id: "",
      name: "",
      phone: "",
      address: "",
      accountingLockDate: "",
    });
    setFormOpen(true);
  };

  const openEdit = (b: Branch) => {
    setFormMode("edit");
    const lock = b.accounting_lock_date;
    setActiveBranch({
      id: b.id,
      name: b.name ?? "",
      phone: b.phone ?? "",
      address: b.address ?? "",
      accountingLockDate:
        lock && String(lock).length >= 10
          ? String(lock).slice(0, 10)
          : "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveBranch(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !activeBranch) return;

    const name = activeBranch.name.trim();
    const phone = activeBranch.phone.trim();
    const address = activeBranch.address.trim();

    if (!name) {
      setError("Branch name is required.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name,
        phone: phone.length ? phone : undefined,
        address: address.length ? address : undefined,
        ...(formMode === "edit"
          ? {
              accountingLockDate:
                activeBranch.accountingLockDate.trim().length >= 10
                  ? activeBranch.accountingLockDate.trim().slice(0, 10)
                  : null,
            }
          : {}),
      };

      if (formMode === "create") {
        const created = await createBranch(tenantSlug, payload);
        setBranches((prev) => [created, ...prev]);
      } else {
        const updated = await updateBranch(
          tenantSlug,
          activeBranch.id,
          payload,
        );
        setBranches((prev) =>
          prev.map((b) => (b.id === updated.id ? updated : b)),
        );
      }

      setFormOpen(false);
      setActiveBranch(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branch");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (b: Branch) => {
    setDeleteCandidate(b);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;

    try {
      setDeletingId(deleteCandidate.id);
      setError(null);
      await deleteBranch(tenantSlug, deleteCandidate.id);
      setBranches((prev) =>
        prev.filter((b) => b.id !== deleteCandidate.id),
      );
      setDeleteConfirmOpen(false);
      setDeleteCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete branch");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
          <div className="flex-1" />

          <div className="hidden items-center gap-2 md:flex">
            <div className="relative w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search branches..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Button
              className="gap-2 rounded-full shadow-md shadow-primary/20 hover:bg-primary/90"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              Add Branch
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Branch Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage pharmacy locations, contact details, and assigned staff.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              <span className="uppercase tracking-wide">Tenant</span>
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              <span className="font-medium text-foreground/80">
                {tenantSlug || "Not set"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard
              label="Total Branches"
              value={stats.total.toLocaleString()}
              hint="All branch records"
              tone="primary"
              icon={Warehouse}
            />
            <StatCard
              label="Active Status"
              value={stats.activeStatus.toLocaleString()}
              hint="Branches with active stock"
              tone="success"
              icon={CheckCircle2}
            />
            <StatCard
              label="Low Stock Alerts"
              value={stats.lowStockAlerts.toLocaleString()}
              hint="Branches needing attention"
              tone="warning"
              icon={AlertTriangle}
            />
            <StatCard
              label="Total Staff"
              value={stats.totalStaff.toLocaleString()}
              hint="Registered staff members"
              tone="primary"
              icon={Users2}
            />
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Card className="overflow-hidden rounded-2xl ring-1 ring-foreground/10">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <CardTitle>Branch Management</CardTitle>
                  <CardDescription>
                    Backed by{" "}
                    <code className="font-mono text-xs">/api/branches</code> with{" "}
                    <code className="font-mono text-xs">X-Tenant</code>.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2 md:hidden">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search..."
                      className="h-10 w-[220px] rounded-xl pl-9"
                    />
                  </div>
                  <Button className="gap-2 rounded-xl" onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading branches…
                </div>
              ) : filteredBranches.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-muted-foreground">
                  <p>No branches found.</p>
                  <Button onClick={openCreate}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add first branch
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                          <TableHead>Branch Name</TableHead>
                          <TableHead>Location/Address</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Manager</TableHead>
                          <TableHead>Stock Level</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedBranches.map((b) => {
                          const summary = stockSummaryByBranchId.get(b.id) ?? {
                            stockPercent: 0,
                            active: false,
                            lowAlert: false,
                            totalEntries: 0,
                            lowEntries: 0,
                          };

                          const stockTone =
                            summary.stockPercent >= 70
                              ? "bg-emerald-500"
                              : summary.stockPercent >= 40
                                ? "bg-primary"
                                : "bg-rose-500";

                          return (
                        <TableRow
                          key={b.id}
                          className="hover:bg-primary/5 transition-colors"
                        >
                          <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                  {(b.name ?? "")
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((p) => p[0]?.toUpperCase())
                                    .join("") || "BR"}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold">
                                    {b.name ?? "Unnamed branch"}
                                  </p>
                                </div>
                              </div>
                          </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {b.address ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {b.phone ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              —
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${stockTone}`}
                                    style={{ width: `${summary.stockPercent}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                  {summary.stockPercent}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="link"
                                className="h-auto px-0 font-bold text-primary hover:text-primary/80"
                                onClick={() => {
                                  setViewBranch(b);
                                  setViewOpen(true);
                                }}
                              >
                                View Details
                              </Button>
                            </TableCell>
                        </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                  </div>

                  <div className="px-6 py-4 bg-muted/30 border-t border-border/60 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing{" "}
                    <span className="font-medium">
                      {showingStart}-{showingEnd}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium">{filteredBranches.length}</span>{" "}
                    branches
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() =>
                        setPage((p) => Math.max(1, p - 1))
                      }
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="sr-only">Previous</span>
                    </Button>
                    {(() => {
                      const show = 3;
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
                          className="h-8 w-8 rounded-lg text-sm font-medium"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      ));
                    })()}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
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
                  {formMode === "create" ? "New branch" : "Edit branch"}
                </SheetTitle>
                <SheetDescription>
                  Add contact and address details for this branch.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {!activeBranch ? (
                  <p className="text-sm text-muted-foreground">No branch selected.</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="branch-name">Branch name</Label>
                      <Input
                        id="branch-name"
                        value={activeBranch.name}
                        onChange={(e) =>
                          setActiveBranch((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev,
                          )
                        }
                        placeholder="e.g. Downtown Pharmacy"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="branch-phone">Phone (optional)</Label>
                      <Input
                        id="branch-phone"
                        value={activeBranch.phone}
                        onChange={(e) =>
                          setActiveBranch((prev) =>
                            prev ? { ...prev, phone: e.target.value } : prev,
                          )
                        }
                        placeholder="e.g. +1 555 123 4567"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="branch-address">Address (optional)</Label>
                      <Input
                        id="branch-address"
                        value={activeBranch.address}
                        onChange={(e) =>
                          setActiveBranch((prev) =>
                            prev ? { ...prev, address: e.target.value } : prev,
                          )
                        }
                        placeholder="Street, city, country"
                      />
                    </div>

                    {formMode === "edit" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="branch-lock">
                          Accounting lock date (optional)
                        </Label>
                        <Input
                          id="branch-lock"
                          type="date"
                          value={
                            activeBranch.accountingLockDate.length >= 10
                              ? activeBranch.accountingLockDate.slice(0, 10)
                              : ""
                          }
                          onChange={(e) =>
                            setActiveBranch((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    accountingLockDate: e.target.value,
                                  }
                                : prev,
                            )
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          No journal postings on or before this date. Clear the
                          field and save to remove the lock.
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Optional fields can be left blank. Name is required.
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
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      saving ||
                      !activeBranch ||
                      activeBranch.name.trim().length === 0
                    }
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {formMode === "create" ? "Create branch" : "Save changes"}
                  </Button>
                </div>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>

        <Sheet
          open={viewOpen}
          onOpenChange={(open) => {
            setViewOpen(open);
            if (!open) setViewBranch(null);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <SheetHeader className="border-b">
              <SheetTitle>Branch details</SheetTitle>
              <SheetDescription>Quick view of the branch record.</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto p-4">
              {!viewBranch ? (
                <p className="text-sm text-muted-foreground">No branch selected.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-semibold">
                      {viewBranch.name ?? "Unnamed branch"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Phone
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {viewBranch.phone ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Created
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(viewBranch.created_at)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      Address
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {viewBranch.address ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      Accounting lock
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(viewBranch.accounting_lock_date ?? null)}
                    </div>
                  </div>

                  <div className="pt-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">ID: {viewBranch.id}</Badge>
                    </div>

                    {(() => {
                      const summary =
                        stockSummaryByBranchId.get(viewBranch.id) ?? {
                          stockPercent: 0,
                          active: false,
                          lowAlert: false,
                          totalEntries: 0,
                          lowEntries: 0,
                        };

                      const stockTone =
                        summary.stockPercent >= 70
                          ? "bg-emerald-500"
                          : summary.stockPercent >= 40
                            ? "bg-primary"
                            : "bg-rose-500";

                      return (
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              Stock level
                            </p>
                            <p className="text-sm font-bold">{summary.stockPercent}%</p>
                          </div>
                          <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${stockTone}`}
                              style={{ width: `${summary.stockPercent}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {summary.active
                              ? "At least one inventory line has quantity on hand."
                              : "No inventory lines currently show quantity on hand."}
                          </p>
                        </div>
                      );
                    })()}

                    <Button
                      className="w-full"
                      onClick={() => {
                        setViewOpen(false);
                        openEdit(viewBranch);
                      }}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit branch
                    </Button>

                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        setViewOpen(false);
                        requestDelete(viewBranch);
                      }}
                      disabled={deletingId === viewBranch.id}
                    >
                      {deletingId === viewBranch.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete branch
                    </Button>
                  </div>
                </div>
              )}
            </div>
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
              <SheetTitle>Delete branch</SheetTitle>
              <SheetDescription>This action cannot be undone.</SheetDescription>
            </SheetHeader>

            <div className="p-4">
              {deleteCandidate ? (
                <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">
                    {deleteCandidate.name ?? "Unnamed branch"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Phone:{" "}
                    <span className="font-mono">{deleteCandidate.phone ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Address: <span>{deleteCandidate.address ?? "—"}</span>
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
                  Delete
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
  );
}

