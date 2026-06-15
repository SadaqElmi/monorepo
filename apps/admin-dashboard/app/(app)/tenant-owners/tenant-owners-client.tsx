"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  Edit2,
  Eye,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import { TenantOwnerDeleteDialog } from "./components/tenant-owner-delete-dialog";
import {
  TenantOwnerFormDialog,
  type TenantOwnerFormMode,
} from "./components/tenant-owner-form-dialog";
import { TenantOwnerViewDialog } from "./components/tenant-owner-view-dialog";
import { AdminCardTableLoading } from "@/components/admin/admin-loading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTenantMutations } from "@/hooks/use-tenant-mutations";
import { useTenantOwners } from "@/hooks/use-tenant-owners";
import type { Tenant } from "@/lib/services/tenants";
import { erpKeys } from "@/lib/erp-query-keys";
import { formatTenantDate } from "@/lib/tenants/format-date";
import {
  getTenantStatusBadgeClass,
  getTenantStatusLabel,
} from "@/lib/tenant-status";
import type { TenantOwnerRow } from "@/lib/tenants/tenant-owners";
import { upsertTenantInCache } from "@/lib/tenants/tenant-query-cache";

type AssignmentFilter = "all" | "assigned" | "unassigned";

export type TenantOwnersPageClientProps = {
  initialTenants?: Tenant[] | null;
  serverPrefetched?: boolean;
};

function ownerInitials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function TenantOwnersClient({
  initialTenants = null,
  serverPrefetched = false,
}: TenantOwnersPageClientProps = {}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [assignment, setAssignment] = useState<AssignmentFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<TenantOwnerFormMode>("create");
  const [activeRow, setActiveRow] = useState<TenantOwnerRow | null>(null);
  const [formTenantId, setFormTenantId] = useState("");
  const [formOwnerName, setFormOwnerName] = useState("");
  const [formOwnerEmail, setFormOwnerEmail] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<TenantOwnerRow | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<TenantOwnerRow | null>(null);

  const {
    tenants,
    rows,
    stats,
    isLoading,
    isFetching,
    loadError,
    refetch,
  } = useTenantOwners({
    initialTenants,
    serverPrefetched,
    search: query,
    assignment,
  });

  const mutations = useTenantMutations();

  const unassignedTenants = useMemo(
    () => tenants.filter((tenant) => !tenant.ownerEmail?.trim()),
    [tenants],
  );

  const invalidateOwnerData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: erpKeys.adminTenantOwners() }),
      queryClient.invalidateQueries({ queryKey: ["erp", "admin", "tenants"] }),
    ]);
  }, [queryClient]);

  const openCreateForm = useCallback(() => {
    const firstUnassigned = unassignedTenants[0];
    setActionError(null);
    setFormMode("create");
    setActiveRow(null);
    setFormTenantId(firstUnassigned?.id ?? "");
    setFormOwnerName(firstUnassigned?.name ? `${firstUnassigned.name} Owner` : "");
    setFormOwnerEmail("");
    setFormOpen(true);
  }, [unassignedTenants]);

  const openEditForm = useCallback((row: TenantOwnerRow) => {
    setActionError(null);
    setFormMode("edit");
    setActiveRow(row);
    setFormTenantId(row.tenantId);
    setFormOwnerName(row.ownerName ?? "");
    setFormOwnerEmail(row.ownerEmail ?? "");
    setFormOpen(true);
    setViewOpen(false);
  }, []);

  const openViewDialog = useCallback((row: TenantOwnerRow) => {
    setViewRow(row);
    setViewOpen(true);
  }, []);

  const openDeleteDialog = useCallback((row: TenantOwnerRow) => {
    setDeleteRow(row);
    setDeleteOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const tenant =
        tenants.find((item) => item.id === formTenantId) ??
        (activeRow
          ? tenants.find((item) => item.id === activeRow.tenantId)
          : null);

      if (!tenant) {
        setActionError("Select a tenant before saving.");
        return;
      }

      const owner = {
        ownerName: formOwnerName.trim(),
        ownerEmail: formOwnerEmail.trim(),
      };

      try {
        setActionError(null);
        const result = await mutations.assignTenantOwnerAccount(tenant, owner);
        upsertTenantInCache(queryClient, result);
        setFormOpen(false);
        setActiveRow(null);
        await invalidateOwnerData();
      } catch (err) {
        setActionError(
          mutations.getErrorMessage(
            err,
            formMode === "create"
              ? "Failed to assign tenant owner"
              : "Failed to update tenant owner",
          ),
        );
      }
    },
    [
      activeRow,
      formMode,
      formOwnerEmail,
      formOwnerName,
      formTenantId,
      invalidateOwnerData,
      mutations,
      queryClient,
      tenants,
    ],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteRow) return;

    try {
      setActionError(null);
      const result = await mutations.clearTenantOwnerAccount(deleteRow.tenantId);
      upsertTenantInCache(queryClient, result);
      setDeleteOpen(false);
      setDeleteRow(null);
      await invalidateOwnerData();
    } catch (err) {
      setActionError(
        mutations.getErrorMessage(err, "Failed to remove tenant owner"),
      );
    }
  }, [deleteRow, invalidateOwnerData, mutations, queryClient]);

  const displayError =
    actionError ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load tenant owners"
        : null);

  const filterOptions = useMemo(
    () =>
      [
        { id: "all" as const, label: "All", count: stats.totalTenants },
        {
          id: "assigned" as const,
          label: "Assigned",
          count: stats.assignedOwners,
        },
        {
          id: "unassigned" as const,
          label: "Unassigned",
          count: stats.unassignedTenants,
        },
      ] satisfies Array<{
        id: AssignmentFilter;
        label: string;
        count: number;
      }>,
    [stats],
  );

  const isRowBusy = useCallback(
    (tenantId: string) => mutations.busyTenantId === tenantId,
    [mutations.busyTenantId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
        <div className="flex-1" />

        <div className="hidden items-center gap-2 md:flex">
          <div className="relative w-[420px] max-w-[42vw]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search owners, emails, or tenants..."
              className="h-9 rounded-full pl-9"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            <span className="sr-only">Refresh</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <Bell className="h-4 w-4" />
            <span className="sr-only">Notifications</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <HelpCircle className="h-4 w-4" />
            <span className="sr-only">Help</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button
            className="gap-1.5 rounded-full"
            onClick={openCreateForm}
            disabled={unassignedTenants.length === 0}
          >
            <Plus className="h-4 w-4" />
            Assign owner
          </Button>
        </div>
      </header>

      <main className="space-y-8 p-6 md:p-8">
        <div className="space-y-2">
          <div className="md:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search owners, emails, or tenants..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Button
              className="mt-3 w-full gap-1.5 rounded-full"
              onClick={openCreateForm}
              disabled={unassignedTenants.length === 0}
            >
              <Plus className="h-4 w-4" />
              Assign owner
            </Button>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Tenant Owners
              </h1>
              <p className="text-sm text-muted-foreground">
                Assign, update, and remove pharmacy owner accounts for each
                client tenant.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.assignedOwners} assigned · {stats.unassignedTenants}{" "}
              unassigned · {stats.totalTenants} tenant
              {stats.totalTenants === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {displayError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {displayError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => {
            const active = assignment === option.id;
            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setAssignment(option.id)}
              >
                {option.label}
                <span className="ml-1.5 text-xs opacity-80">{option.count}</span>
              </Button>
            );
          })}
        </div>

        <Card className="ring-1 ring-foreground/10">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b pb-4">
            <div className="space-y-1">
              <CardTitle>Owner directory</CardTitle>
              <CardDescription>
                Manage owner assignments via{" "}
                <code className="font-mono text-xs">/api/admin/tenants/:id/owner</code>.
              </CardDescription>
            </div>
            <div className="hidden items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground md:inline-flex">
              <UserRound className="h-3 w-3" />
              Client admin accounts
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {isLoading ? (
              <AdminCardTableLoading
                message="Loading tenant owners…"
                rows={8}
                cols={5}
              />
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <p>No matching owner records.</p>
                {unassignedTenants.length > 0 ? (
                  <Button size="sm" className="mt-2" onClick={openCreateForm}>
                    <Plus className="mr-1 h-4 w-4" />
                    Assign first owner
                  </Button>
                ) : (
                  <Button asChild size="sm" className="mt-2">
                    <Link href="/tenants">Create a client tenant</Link>
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Owner</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const initials = ownerInitials(
                      row.ownerName,
                      row.ownerEmail,
                    );
                    const avatarTone =
                      row.hasOwner && idx % 2 === 0
                        ? "bg-primary/10 text-primary"
                        : row.hasOwner
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-muted text-muted-foreground";
                    const busy = isRowBusy(row.tenantId);

                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${avatarTone}`}
                            >
                              {row.hasOwner ? initials || "O" : "?"}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {row.ownerName ?? "No owner assigned"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.ownerEmail ?? "Owner email missing"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">
                                {row.tenantName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.tenantSlug ?? row.tenantId}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTenantStatusBadgeClass(row.tenantStatus)}`}
                          >
                            {getTenantStatusLabel(row.tenantStatus)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTenantDate(row.lastLoginAt ?? undefined)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-full text-muted-foreground hover:text-primary"
                              onClick={() => openViewDialog(row)}
                              disabled={busy}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                            {row.hasOwner ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full text-muted-foreground hover:text-primary"
                                onClick={() => openEditForm(row)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Edit2 className="h-4 w-4" />
                                )}
                                <span className="sr-only">Edit</span>
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full text-muted-foreground hover:text-primary"
                                onClick={() => {
                                  setActionError(null);
                                  setFormMode("create");
                                  setActiveRow(row);
                                  setFormTenantId(row.tenantId);
                                  setFormOwnerName(`${row.tenantName} Owner`);
                                  setFormOwnerEmail("");
                                  setFormOpen(true);
                                }}
                                disabled={busy}
                              >
                                <Plus className="h-4 w-4" />
                                <span className="sr-only">Assign</span>
                              </Button>
                            )}
                            {row.hasOwner ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full text-muted-foreground hover:text-destructive"
                                onClick={() => openDeleteDialog(row)}
                                disabled={busy}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Remove</span>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <TenantOwnerFormDialog
        open={formOpen}
        mode={formMode}
        row={activeRow}
        tenantOptions={
          formMode === "create" ? unassignedTenants : tenants
        }
        tenantId={formTenantId}
        ownerName={formOwnerName}
        ownerEmail={formOwnerEmail}
        saving={mutations.isActionPending}
        onOpenChange={(open) => {
          if (mutations.isActionPending) return;
          setFormOpen(open);
          if (!open) setActiveRow(null);
        }}
        onTenantChange={(tenantId) => {
          const tenant = unassignedTenants.find((item) => item.id === tenantId);
          setFormTenantId(tenantId);
          if (tenant && !formOwnerName.trim()) {
            setFormOwnerName(`${tenant.name} Owner`);
          }
        }}
        onChange={(field, value) => {
          if (field === "ownerName") setFormOwnerName(value);
          if (field === "ownerEmail") setFormOwnerEmail(value);
        }}
        onSubmit={(event) => void handleFormSubmit(event)}
      />

      <TenantOwnerViewDialog
        open={viewOpen}
        row={viewRow}
        onOpenChange={setViewOpen}
        onEdit={() => {
          if (viewRow) openEditForm(viewRow);
        }}
      />

      <TenantOwnerDeleteDialog
        open={deleteOpen}
        row={deleteRow}
        deleting={Boolean(
          deleteRow && mutations.busyTenantId === deleteRow.tenantId,
        )}
        onOpenChange={(open) => {
          if (mutations.isActionPending) return;
          setDeleteOpen(open);
          if (!open) setDeleteRow(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}
