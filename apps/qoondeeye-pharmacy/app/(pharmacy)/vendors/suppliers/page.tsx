"use client";

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
  createSupplier,
  deleteSupplier,
  getSuppliers,
  updateSupplier,
  type Supplier,
} from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users2,
  Truck,
  Clock3,
} from "lucide-react";
import * as React from "react";

type FormMode = "create" | "edit";

type EditableSupplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
}

function initialsFor(name: string | null | undefined) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase()).filter(Boolean);
  return letters.join("") || "SUP";
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
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning";
}) {
  const iconTone =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-amber-500/10 text-amber-700";

  const valueTone =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-amber-600 dark:text-amber-400";

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <h3 className={`text-2xl font-bold mt-1 ${valueTone}`}>{value}</h3>
          </div>
          <div className={`rounded-lg p-2 ${iconTone}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function SuppliersPage() {
  const [tenantSlug] = React.useState(() => getStoredUser()?.tenantSlug ?? "pharmacy1");

  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const pageSize = 4;
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("create");
  const [activeSupplier, setActiveSupplier] = React.useState<EditableSupplier | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<Supplier | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!tenantSlug) return;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getSuppliers(tenantSlug);
        if (cancelled) return;
        setSuppliers(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load suppliers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const filteredSuppliers = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...suppliers].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
    );

    if (!q) return sorted;

    return sorted.filter((s) => {
      const haystack = [s.name, s.phone, s.email, s.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q) || s.id.toLowerCase().includes(q);
    });
  }, [suppliers, query]);

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));

  React.useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  const pagedSuppliers = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, page]);

  const showingStart = filteredSuppliers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, filteredSuppliers.length);

  const stats = React.useMemo(() => {
    return {
      totalSuppliers: suppliers.length,
      activeOrders: 0,
      pendingDeliveries: 0,
    };
  }, [suppliers.length]);

  const openCreate = () => {
    setFormMode("create");
    setActiveSupplier({
      id: "",
      name: "",
      phone: "",
      email: "",
      address: "",
    });
    setFormOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setFormMode("edit");
    setActiveSupplier({
      id: s.id,
      name: s.name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveSupplier(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !activeSupplier) return;

    const name = activeSupplier.name.trim();
    if (!name) {
      setError("Supplier name is required.");
      return;
    }

    const payload = {
      name,
      phone: activeSupplier.phone.trim() || undefined,
      email: activeSupplier.email.trim() || undefined,
      address: activeSupplier.address.trim() || undefined,
    };

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        const created = await createSupplier(tenantSlug, payload);
        setSuppliers((prev) => [created, ...prev]);
      } else {
        const updated = await updateSupplier(tenantSlug, activeSupplier.id, payload);
        if (!updated) {
          setError("Supplier not found (it may have been deleted).");
          return;
        }
        setSuppliers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      }

      setFormOpen(false);
      setActiveSupplier(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (s: Supplier) => {
    setDeleteCandidate(s);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;
    try {
      setDeletingId(deleteCandidate.id);
      setError(null);

      await deleteSupplier(tenantSlug, deleteCandidate.id);
      setSuppliers((prev) => prev.filter((s) => s.id !== deleteCandidate.id));

      setDeleteConfirmOpen(false);
      setDeleteCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete supplier");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
          <div className="flex-1" />

          <div className="relative w-64 max-w-[32vw] hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers..."
              className="h-9 rounded-full pl-9"
            />
          </div>
        </header>

        <main className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
                <p className="mt-1 max-w-xl text-base text-muted-foreground">
                  Manage and track your global pharmaceutical providers and supply chains.
                </p>
              </div>
              <Button className="gap-2 rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add New Supplier
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Total Suppliers"
                value={stats.totalSuppliers.toLocaleString()}
                hint="All supplier records"
                tone="primary"
                icon={Users2}
              />
              <StatCard
                label="Active Orders"
                value={stats.activeOrders.toLocaleString()}
                hint="Not tracked yet in purchases"
                tone="success"
                icon={Truck}
              />
              <StatCard
                label="Pending Deliveries"
                value={stats.pendingDeliveries.toLocaleString()}
                hint="Not tracked yet in purchases"
                tone="warning"
                icon={Clock3}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Card className="overflow-hidden rounded-2xl border shadow-sm">
              <CardHeader className="border-b bg-muted/30 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Supplier directory</CardTitle>
                    <CardDescription>
                      Backed by <code className="font-mono text-xs">/api/suppliers</code> with <code className="font-mono text-xs">X-Tenant</code>.
                    </CardDescription>
                  </div>
                  <div className="md:hidden relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search suppliers..."
                      className="h-10 w-[220px] rounded-xl pl-9"
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading suppliers…
                  </div>
                ) : pagedSuppliers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center text-sm text-muted-foreground">
                    <p>No suppliers found.</p>
                    <Button onClick={openCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add first supplier
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                              Supplier Name
                            </TableHead>
                            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                              Phone
                            </TableHead>
                            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                              Email
                            </TableHead>
                            <TableHead className="font-semibold uppercase tracking-wider text-muted-foreground">
                              Address
                            </TableHead>
                            <TableHead className="w-24 text-right font-semibold uppercase tracking-wider text-primary">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedSuppliers.map((s) => {
                            const idShort = s.id.length > 8 ? s.id.slice(0, 8) : s.id;
                            return (
                              <TableRow
                                key={s.id}
                                className="hover:bg-primary/5 transition-colors"
                              >
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                      {initialsFor(s.name)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold truncate">
                                        {s.name ?? "Unnamed supplier"}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground font-medium truncate">
                                        ID: {idShort}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {s.phone ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {s.email ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {s.address ?? "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 rounded-lg text-primary hover:text-primary/80"
                                      onClick={() => openEdit(s)}
                                    >
                                      <Edit2 className="h-4 w-4" />
                                      <span className="sr-only">Edit supplier</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-500/80"
                                      onClick={() => requestDelete(s)}
                                      disabled={deletingId === s.id}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span className="sr-only">Delete supplier</span>
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing{" "}
                        <span className="font-medium">{showingStart}</span> to{" "}
                        <span className="font-medium">{showingEnd}</span> of{" "}
                        <span className="font-medium">{filteredSuppliers.length}</span>{" "}
                        suppliers
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
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
                          if (end - start + 1 < show) start = Math.max(1, end - show + 1);

                          return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(
                            (p) => (
                              <Button
                                key={p}
                                variant={p === page ? "default" : "outline"}
                                size="icon"
                                className="h-8 w-8 rounded-lg text-xs font-medium"
                                onClick={() => setPage(p)}
                              >
                                {p}
                              </Button>
                            ),
                          );
                        })()}

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
                  {formMode === "create" ? "New supplier" : "Edit supplier"}
                </SheetTitle>
                <SheetDescription>
                  Add supplier contact details used for purchasing records.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {!activeSupplier ? (
                  <p className="text-sm text-muted-foreground">No supplier selected.</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="supplier-name">Supplier name</Label>
                      <Input
                        id="supplier-name"
                        value={activeSupplier.name}
                        onChange={(e) =>
                          setActiveSupplier((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev,
                          )
                        }
                        placeholder="e.g. Global Pharma Co."
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="supplier-phone">Phone (optional)</Label>
                      <Input
                        id="supplier-phone"
                        value={activeSupplier.phone}
                        onChange={(e) =>
                          setActiveSupplier((prev) =>
                            prev ? { ...prev, phone: e.target.value } : prev,
                          )
                        }
                        placeholder="e.g. +1 555 010 1044"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="supplier-email">Email (optional)</Label>
                      <Input
                        id="supplier-email"
                        value={activeSupplier.email}
                        onChange={(e) =>
                          setActiveSupplier((prev) =>
                            prev ? { ...prev, email: e.target.value } : prev,
                          )
                        }
                        placeholder="e.g. orders@globalpharma.com"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="supplier-address">Address (optional)</Label>
                      <Input
                        id="supplier-address"
                        value={activeSupplier.address}
                        onChange={(e) =>
                          setActiveSupplier((prev) =>
                            prev ? { ...prev, address: e.target.value } : prev,
                          )
                        }
                        placeholder="Street, city, country"
                      />
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                      {formMode === "edit" && activeSupplier.id ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate">
                            Record ID:{" "}
                            <span className="font-mono">{activeSupplier.id}</span>
                          </span>
                          <Badge variant="secondary">Saved</Badge>
                        </div>
                      ) : (
                        <>Name is required. Optional fields can be left blank.</>
                      )}
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
                      !activeSupplier ||
                      activeSupplier.name.trim().length === 0
                    }
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {formMode === "create" ? "Create supplier" : "Save changes"}
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
              <SheetTitle>Delete supplier</SheetTitle>
              <SheetDescription>This action cannot be undone.</SheetDescription>
            </SheetHeader>

            <div className="p-4">
              {deleteCandidate ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-semibold">
                    {deleteCandidate.name ?? "Unnamed supplier"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="block text-xs font-medium">Phone</span>
                      <span>{deleteCandidate.phone ?? "—"}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium">Email</span>
                      <span>{deleteCandidate.email ?? "—"}</span>
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
                  {deletingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Delete supplier
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
  );
}
