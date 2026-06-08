"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bell,
  Edit2,
  Globe2,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { AdminCardTableLoading } from "@/components/admin/admin-loading";
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
  type Domain,
  type Tenant,
  createDomain,
  deleteDomain,
  updateDomain,
} from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getDomains } from "@/lib/services/domains";
import { getTenants } from "@/lib/services/tenants";

type FormMode = "create" | "edit";

type EditableDomain = {
  id: string;
  tenantId: string;
  domain: string;
};

export type DomainsPageClientProps = {
  initialDomains?: Domain[] | null;
  initialTenants?: Tenant[] | null;
  serverPrefetched?: boolean;
};

export default function DomainsPage({
  initialDomains = null,
  initialTenants = null,
  serverPrefetched = false,
}: DomainsPageClientProps) {
  const queryClient = useQueryClient();
  const domainsQuery = useQuery({
    queryKey: erpKeys.adminDomains(),
    queryFn: () => getDomains(),
    staleTime: ERP_STALE_STATIC,
    initialData:
      serverPrefetched && initialDomains ? initialDomains : undefined,
  });
  const tenantsQuery = useQuery({
    queryKey: erpKeys.adminTenants(),
    queryFn: () => getTenants(),
    staleTime: ERP_STALE_STATIC,
    initialData:
      serverPrefetched && initialTenants ? initialTenants : undefined,
  });
  const domains = domainsQuery.data ?? [];
  const tenants = tenantsQuery.data ?? [];
  const loading = domainsQuery.isLoading || tenantsQuery.isLoading;
  const loadError = domainsQuery.error ?? tenantsQuery.error;
  const [error, setError] = useState<string | null>(null);
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load domains"
        : null);

  const [query, setQuery] = useState("");
  const [tenantFilter, setTenantFilter] = useState<string>("__all__");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeDomain, setActiveDomain] = useState<EditableDomain | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteDomain, setPendingDeleteDomain] = useState<Domain | null>(
    null,
  );

  const tenantOptions = useMemo(() => {
    return [...tenants].sort((a, b) => a.name.localeCompare(b.name));
  }, [tenants]);

  const filteredDomains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...domains]
      .filter((d) =>
        tenantFilter === "__all__" ? true : d.tenantId === tenantFilter,
      )
      .filter((d) => {
        if (!q) return true;
        const tenantName = d.tenant?.name ?? "";
        return (
          d.domain.toLowerCase().includes(q) ||
          tenantName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  }, [domains, query, tenantFilter]);

  const showingCount = filteredDomains.length;

  const handleOpenCreate = () => {
    setFormMode("create");
    setActiveDomain({
      id: "",
      tenantId:
        tenantFilter !== "__all__"
          ? tenantFilter
          : tenantOptions[0]?.id ?? "",
      domain: "",
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (domain: Domain) => {
    setFormMode("edit");
    setActiveDomain({
      id: domain.id,
      tenantId: domain.tenantId,
      domain: domain.domain ?? "",
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveDomain(null);
  };

  const handleChange = (field: keyof EditableDomain, value: string) => {
    setActiveDomain((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDomain) return;

    const domainValue = activeDomain.domain.trim();
    if (!domainValue) return;
    if (!activeDomain.tenantId) {
      setError("Please select a client.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        await createDomain({
          tenantId: activeDomain.tenantId,
          domain: domainValue,
        });
      } else {
        await updateDomain(activeDomain.id, {
          domain: domainValue,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: erpKeys.adminDomains(),
      });

      setFormOpen(false);
      setActiveDomain(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save domain");
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDelete = (domain: Domain) => {
    setPendingDeleteDomain(domain);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteDomain) return;
    const id = pendingDeleteDomain.id;
    try {
      setDeletingId(id);
      setError(null);
      await deleteDomain(id);
      await queryClient.invalidateQueries({
        queryKey: erpKeys.adminDomains(),
      });
      setDeleteDialogOpen(false);
      setPendingDeleteDomain(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete domain");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />

          <div className="hidden items-center gap-2 md:flex">
            <div className="relative w-[360px] max-w-[38vw]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search domains or clients..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <div className="w-[220px]">
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger size="sm" className="w-full rounded-full">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="__all__">All Clients</SelectItem>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              className="gap-1.5 rounded-full"
              onClick={handleOpenCreate}
              disabled={tenantOptions.length === 0}
            >
              <Plus className="h-4 w-4" />
              Add Domain
            </Button>
          </div>
        </header>

        <main className="space-y-6 p-6 md:p-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Domain Mappings
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage custom domains and mappings for your clients.
            </p>
          </div>

          <div className="grid gap-2 md:hidden md:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search domains or clients..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger size="sm" className="w-full rounded-full">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="__all__">All Clients</SelectItem>
                {tenantOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="gap-1.5 rounded-full md:col-span-2"
              onClick={handleOpenCreate}
              disabled={tenantOptions.length === 0}
            >
              <Plus className="h-4 w-4" />
              Add Domain
            </Button>
          </div>

          {displayError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {displayError}
            </p>
          )}

          <Card className="ring-1 ring-foreground/10">
            <CardHeader className="border-b pb-4">
              <CardTitle>Domain mappings</CardTitle>
              <CardDescription>
                Backed by <code className="font-mono text-xs">/api/domains</code>
                . Domains are unique across all clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {loading ? (
                <AdminCardTableLoading
                  message="Loading domains…"
                  rows={8}
                  cols={5}
                />
              ) : tenantOptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No clients found.</p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Create a client first, then add domain mappings here.
                  </p>
                  <Button asChild size="sm" className="mt-2">
                    <a href="/tenants">Go to clients</a>
                  </Button>
                </div>
              ) : filteredDomains.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No domain mappings yet.</p>
                  <Button size="sm" className="mt-2" onClick={handleOpenCreate}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add first domain
                  </Button>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Domain</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Created Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDomains.map((d) => {
                        const domainLower = (d.domain ?? "").toLowerCase();
                        const status =
                          domainLower.includes(".test") ||
                          domainLower.includes("test") ||
                          domainLower.endsWith(".local")
                            ? "pending_dns"
                            : "active";

                        return (
                          <TableRow key={d.id} className="align-top">
                            <TableCell>
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary ring-1 ring-primary/20">
                                <Globe2 className="h-4 w-4" />
                                {d.domain}
                              </span>
                            </TableCell>
                            <TableCell>
                              <a
                                className="font-medium text-foreground hover:text-primary transition-colors"
                                href="/tenants"
                              >
                                {d.tenant?.name ??
                                  tenantOptions.find((t) => t.id === d.tenantId)
                                    ?.name ??
                                  "Unknown client"}
                              </a>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {d.createdAt
                                ? new Date(d.createdAt).toLocaleDateString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "2-digit",
                                      year: "numeric",
                                    },
                                  )
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`gap-1.5 border border-transparent bg-transparent p-0 text-xs font-medium ${
                                  status === "active"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    status === "active"
                                      ? "bg-emerald-500"
                                      : "bg-amber-500"
                                  }`}
                                />
                                {status === "active" ? "Active" : "Pending DNS"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  onClick={() => handleOpenEdit(d)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                  <span className="sr-only">Edit</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => handleRequestDelete(d)}
                                  disabled={deletingId === d.id}
                                >
                                  {deletingId === d.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <p>
                      Showing {showingCount === 0 ? 0 : 1} to {showingCount} of{" "}
                      {showingCount} domains
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled>
                        Previous
                      </Button>
                      <Button variant="default" size="sm" disabled>
                        1
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>

        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (deletingId) return;
            setDeleteDialogOpen(open);
            if (!open) setPendingDeleteDomain(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete domain mapping?</DialogTitle>
              <DialogDescription>
                This will permanently remove{" "}
                <span className="font-medium text-foreground">
                  {pendingDeleteDomain?.domain ?? "this domain"}
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
                  setPendingDeleteDomain(null);
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
                  !pendingDeleteDomain || deletingId === pendingDeleteDomain.id
                }
              >
                {deletingId === pendingDeleteDomain?.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Delete domain
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {formOpen && activeDomain && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl">
              <form onSubmit={handleSubmit}>
                <div className="border-b px-5 py-3">
                  <h2 className="text-base font-semibold">
                    {formMode === "create" ? "Add domain" : "Edit domain"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Domains are unique globally. Use the exact hostname (no
                    protocol).
                  </p>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <div className="space-y-1">
                    <Label htmlFor="domain-tenant">Client</Label>
                    <Select
                      value={activeDomain.tenantId || "__none__"}
                      onValueChange={(v) =>
                        handleChange("tenantId", v === "__none__" ? "" : v)
                      }
                      disabled={formMode === "edit"}
                    >
                      <SelectTrigger id="domain-tenant" className="w-full">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select client…</SelectItem>
                        {tenantOptions.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formMode === "edit" && (
                      <p className="text-[11px] text-muted-foreground">
                        Tenant can’t be changed after creation.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="domain-value">Domain</Label>
                    <div className="flex overflow-hidden rounded-lg ring-1 ring-border">
                      <span className="inline-flex items-center bg-muted px-3 text-sm text-muted-foreground">
                        https://
                      </span>
                      <Input
                        id="domain-value"
                        value={activeDomain.domain}
                        onChange={(e) => handleChange("domain", e.target.value)}
                        required
                        placeholder="portal.client.com"
                        className="rounded-none border-0 ring-0 focus-visible:ring-0"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      You'll need to point your CNAME record to{" "}
                      <code>custom.pharmacare.com</code>
                    </p>
                  </div>
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
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving || !activeDomain.tenantId}
                  >
                    {saving && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    {formMode === "create" ? "Add domain" : "Save changes"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}

