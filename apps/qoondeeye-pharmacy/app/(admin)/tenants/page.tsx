"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Database,
  Edit2,
  Globe2,
  HelpCircle,
  Loader2,
  Plus,
  Search,
  Trash2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tenant,
  createTenant,
  deleteTenantBySchemaName,
  getTenants,
  updateTenant,
} from "@/lib/api";

type FormMode = "create" | "edit";
type StatusTab = "all" | "active" | "archived";

type EditableTenant = Pick<Tenant, "id" | "name" | "schemaName" | "status"> & {
  primaryDomain?: string;
  extraDomains?: string;
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeTenant, setActiveTenant] = useState<EditableTenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteTenant, setPendingDeleteTenant] = useState<Tenant | null>(
    null,
  );
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getTenants();
        if (!cancelled) {
          setTenants(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load tenants",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenCreate = () => {
    setFormMode("create");
    setActiveTenant({
      id: "",
      name: "",
      schemaName: "",
      status: "active",
      primaryDomain: "",
      extraDomains: "",
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (tenant: Tenant) => {
    const [primary, ...rest] = tenant.domains ?? [];
    setFormMode("edit");
    setActiveTenant({
      id: tenant.id,
      name: tenant.name,
      schemaName: tenant.schemaName,
      status: tenant.status,
      primaryDomain: primary?.domain ?? "",
      extraDomains: rest.map((d) => d.domain).join(", "),
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveTenant(null);
  };

  const handleChange = (field: keyof EditableTenant, value: string) => {
    setActiveTenant((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant) return;

    try {
      setSaving(true);
      setError(null);

      const domainsInput = [
        activeTenant.primaryDomain?.trim(),
        ...(activeTenant.extraDomains
          ? activeTenant.extraDomains
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : []),
      ].filter(Boolean) as string[];

      if (formMode === "create") {
        const created = await createTenant({
          name: activeTenant.name.trim(),
          domain: activeTenant.primaryDomain?.trim() || undefined,
          schemaName: activeTenant.schemaName.trim() || undefined,
          domains: domainsInput.length ? domainsInput : undefined,
        });
        setTenants((prev) => [created, ...prev]);
      } else {
        const updated = await updateTenant(activeTenant.id, {
          name: activeTenant.name.trim(),
          status: activeTenant.status,
        });
        setTenants((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)),
        );
      }

      setFormOpen(false);
      setActiveTenant(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client");
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDelete = (tenant: Tenant) => {
    setPendingDeleteTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTenant) return;
    const schema = pendingDeleteTenant.schemaName?.trim();
    if (!schema) {
      setError("Cannot delete: missing schema name. Refresh the page and try again.");
      return;
    }
    try {
      setDeletingId(pendingDeleteTenant.id);
      setError(null);
      await deleteTenantBySchemaName(schema);
      const data = await getTenants();
      setTenants(data);
      setDeleteDialogOpen(false);
      setPendingDeleteTenant(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete client");
    } finally {
      setDeletingId(null);
    }
  };

  const handleInlineStatusChange = async (tenant: Tenant, status: string) => {
    if (tenant.status === status) return;
    try {
      setUpdatingStatusId(tenant.id);
      setError(null);
      const updated = await updateTenant(tenant.id, { status });
      setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update tenant status",
      );
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const count = tenants.length;

  const filteredTenants = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...tenants]
      .filter((t) => {
        if (statusTab === "all") return true;
        if (statusTab === "active") return t.status === "active";
        // "Archived" in the HTML sample maps closest to inactive for now.
        return t.status === "inactive";
      })
      .filter((t) => {
        if (!q) return true;
        const haystack = [
          t.name,
          t.id,
          t.schemaName,
          ...(t.domains?.map((d) => d.domain) ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  }, [query, statusTab, tenants]);

  const showingCount = filteredTenants.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />

          <div className="hidden items-center gap-2 md:flex">
            <div className="relative w-[420px] max-w-[42vw]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients, domains, or IDs..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-full"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              <span className="sr-only">Notifications</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="sr-only">Help</span>
            </Button>
          </div>
        </header>

        <main className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Clients (Tenants)
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage pharmacy client instances and their isolated data schemas.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <Button
                className="gap-1.5 rounded-full"
                onClick={handleOpenCreate}
              >
                <Plus className="h-4 w-4" />
                New Client
              </Button>
              <div className="text-xs text-muted-foreground">
                {count} client{count === 1 ? "" : "s"} total
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-2">
            <div className="flex gap-6">
              <button
                type="button"
                onClick={() => setStatusTab("all")}
                className={`pb-2 text-sm font-semibold transition-colors ${
                  statusTab === "all"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Clients
              </button>
              <button
                type="button"
                onClick={() => setStatusTab("active")}
                className={`pb-2 text-sm font-semibold transition-colors ${
                  statusTab === "active"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusTab("archived")}
                className={`pb-2 text-sm font-semibold transition-colors ${
                  statusTab === "archived"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Archived
              </button>
            </div>

            <div className="w-full md:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients, domains, or IDs..."
                  className="h-9 rounded-full pl-9"
                />
              </div>
            </div>
          </div>

          <Card className="ring-1 ring-foreground/10">
            <CardHeader className="border-b pb-4">
              <CardTitle>Client list</CardTitle>
              <CardDescription>
                Backed by <code className="font-mono text-xs">/api/tenants</code>{" "}
                (clients = pharmacy tenants).
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading clients…
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No clients found.</p>
                  <Button size="sm" className="mt-2" onClick={handleOpenCreate}>
                    <Plus className="mr-1 h-4 w-4" />
                    Create first client
                  </Button>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Name</TableHead>
                        <TableHead>Schema</TableHead>
                        <TableHead>Domains</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenants.map((tenant) => (
                        <TableRow key={tenant.id} className="align-top">
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{tenant.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ID: {tenant.id}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-mono text-primary">
                              <Database className="h-3 w-3" />
                              {tenant.schemaName}
                            </span>
                          </TableCell>
                          <TableCell>
                            {tenant.domains.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                No domains
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {tenant.domains.map((d) => (
                                  <span
                                    key={d.id}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary"
                                  >
                                    <Globe2 className="h-3 w-3" />
                                    {d.domain}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`gap-1.5 ${
                                tenant.status === "active"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : tenant.status === "suspended"
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  tenant.status === "active"
                                    ? "bg-emerald-500"
                                    : tenant.status === "suspended"
                                      ? "bg-amber-500"
                                      : "bg-slate-400"
                                }`}
                              />
                              {tenant.status === "active"
                                ? "Active"
                                : tenant.status === "inactive"
                                  ? "Inactive"
                                  : "Suspended"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <Select
                                value={tenant.status}
                                onValueChange={(v) =>
                                  handleInlineStatusChange(tenant, v)
                                }
                                disabled={updatingStatusId === tenant.id}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="w-[140px] rounded-full px-3 text-[11px] font-semibold uppercase"
                                >
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent align="end">
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">
                                    Inactive
                                  </SelectItem>
                                  <SelectItem value="suspended">
                                    Suspended
                                  </SelectItem>
                                </SelectContent>
                              </Select>

                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => handleOpenEdit(tenant)}
                              >
                                <Edit2 className="h-4 w-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleRequestDelete(tenant)}
                                disabled={deletingId === tenant.id}
                              >
                                {deletingId === tenant.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                <span className="sr-only">Delete</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                    <span>
                      Showing {showingCount === 0 ? 0 : 1} to {showingCount} of{" "}
                      {showingCount} clients
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-lg"
                        disabled
                      >
                        <span className="sr-only">Previous</span>
                        ‹
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-lg"
                        disabled
                      >
                        <span className="sr-only">Next</span>
                        ›
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (deletingId) return;
              setDeleteDialogOpen(open);
              if (!open) setPendingDeleteTenant(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete client?</DialogTitle>
                <DialogDescription>
                  This will permanently remove{" "}
                  <span className="font-medium text-foreground">
                    {pendingDeleteTenant?.name ?? "this client"}
                  </span>
                  . This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setPendingDeleteTenant(null);
                  }}
                  disabled={Boolean(deletingId)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleConfirmDelete()}
                  disabled={
                    !pendingDeleteTenant || deletingId === pendingDeleteTenant.id
                  }
                >
                  {deletingId === pendingDeleteTenant?.id ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  Delete client
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {formOpen && activeTenant && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl">
                <form onSubmit={handleSubmit}>
                  <div className="border-b px-5 py-3">
                    <h2 className="text-base font-semibold">
                      {formMode === "create" ? "Create client" : "Edit client"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Name, schema and optional domains for this pharmacy client.
                    </p>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    <div className="space-y-1">
                      <Label htmlFor="tenant-name">Name</Label>
                      <Input
                        id="tenant-name"
                        value={activeTenant.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        required
                        placeholder="City Clinic"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tenant-schema">Schema name</Label>
                      <Input
                        id="tenant-schema"
                        value={activeTenant.schemaName}
                        onChange={(e) =>
                          handleChange("schemaName", e.target.value)
                        }
                        placeholder="city_clinic"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Leave blank to auto-generate from name or domain.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tenant-domain">Primary domain</Label>
                      <Input
                        id="tenant-domain"
                        value={activeTenant.primaryDomain ?? ""}
                        onChange={(e) =>
                          handleChange("primaryDomain", e.target.value)
                        }
                        placeholder="city.yourapp.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tenant-extra-domains">
                        Extra domains (comma separated)
                      </Label>
                      <Input
                        id="tenant-extra-domains"
                        value={activeTenant.extraDomains ?? ""}
                        onChange={(e) =>
                          handleChange("extraDomains", e.target.value)
                        }
                        placeholder="cityclinic.com, pharmacy.cityclinic.com"
                      />
                    </div>
                    {formMode === "edit" && (
                      <div className="space-y-1">
                        <Label htmlFor="tenant-status">Status</Label>
                        <Select
                          value={activeTenant.status}
                          onValueChange={(v) => handleChange("status", v)}
                        >
                          <SelectTrigger id="tenant-status" className="w-full">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Setting to <code>inactive</code> disables tenant login.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCloseForm}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      {formMode === "create" ? "Create client" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
  );
}
