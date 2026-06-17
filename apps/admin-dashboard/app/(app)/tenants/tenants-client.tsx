"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, HelpCircle, Loader2, Plus, Search } from "lucide-react";

import { TenantOwnerDialog } from "./components/tenant-activate-dialog";
import { TenantFormDialog } from "./components/tenant-form-dialog";
import {
  PaginatedTenantTable,
  TenantTableHeader,
  VirtualizedTenantList,
  type TenantAction,
  type TenantRowActions,
} from "./components/tenant-table";
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
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAdminTenants } from "@/hooks/use-admin-tenants";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTenantListView } from "@/hooks/use-tenant-list-view";
import { useTenantMutations } from "@/hooks/use-tenant-mutations";
import { erpKeys } from "@/lib/erp-query-keys";
import { type Tenant, getTenantHealth, getTenantPosTerminals } from "@/lib/api";
import type { TenantListResult } from "@/lib/services/tenants";
import { TENANT_PAGE_SIZE } from "@/lib/tenants/constants";
import { totalPages } from "@/lib/tenants/filter-tenants";
import { formatTenantDate } from "@/lib/tenants/format-date";
import {
  formatDatabaseHealthStatus,
  getTenantDatabaseName,
} from "@/lib/tenants/database-name";
import { tenantMissingOwner } from "@/lib/tenants/tenant-owner";
import {
  emptyEditableTenant,
  type EditableTenant,
  type TenantFormMode,
} from "@/lib/tenants/tenant-form";
import {
  getProvisioningStatusLabel,
  getTenantStatusBadgeClass,
  getTenantStatusLabel,
  type StatusTab,
} from "@/lib/tenant-status";
import {
  canResetPosBinding,
  canRevokePosBinding,
} from "@/lib/tenants/tenant-actions";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending_setup", label: "Pending" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
  { value: "failed", label: "Failed" },
];

export type TenantsPageClientProps = {
  initialData?: TenantListResult | null;
  serverPrefetched?: boolean;
};

function bytesLabel(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function TenantsPage({
  initialData = null,
  serverPrefetched = false,
}: TenantsPageClientProps = {}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode] = useState<TenantFormMode>("create");
  const [activeTenant, setActiveTenant] = useState<EditableTenant | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [ownerDialogTenant, setOwnerDialogTenant] = useState<Tenant | null>(null);
  const [ownerDialogPurpose, setOwnerDialogPurpose] = useState<"activate" | "assign">(
    "assign",
  );
  const [ownerDialogName, setOwnerDialogName] = useState("");
  const [ownerDialogEmail, setOwnerDialogEmail] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { tenants, serverTotal, provisioningPollActive, isLoading, loadError } =
    useAdminTenants({
      initialData,
      serverPrefetched,
      page,
      pageSize: TENANT_PAGE_SIZE,
      search: debouncedSearch,
    });

  const {
    statusTab,
    setStatusTab,
    filteredTenants,
    useVirtualization,
    totalFiltered,
  } = useTenantListView(tenants);

  const pageCount = totalPages(serverTotal, TENANT_PAGE_SIZE);

  const isLgUp = useMediaQuery("(min-width: 1024px)");
  const virtualizeList = useVirtualization && isLgUp;

  const selectedTenantId = selectedTenant?.id;
  const healthQuery = useQuery({
    queryKey: selectedTenantId
      ? [...erpKeys.adminTenants(), selectedTenantId, "health"]
      : [...erpKeys.adminTenants(), "none", "health"],
    queryFn: () => getTenantHealth(selectedTenantId!),
    enabled: Boolean(selectedTenantId),
  });

  const terminalsQuery = useQuery({
    queryKey: selectedTenantId
      ? [...erpKeys.adminTenants(), selectedTenantId, "pos-terminals"]
      : [...erpKeys.adminTenants(), "none", "pos-terminals"],
    queryFn: () => getTenantPosTerminals(selectedTenantId!),
    enabled: Boolean(selectedTenantId),
  });

  const mutations = useTenantMutations({
    onCreateSuccess: (tenant) => {
      setSelectedTenant(tenant);
    },
  });

  const displayError =
    actionError ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load tenants"
        : null);

  const handleOpenCreate = useCallback(() => {
    setActionError(null);
    setActiveTenant(emptyEditableTenant());
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    if (mutations.isSaving) return;
    setFormOpen(false);
    setActiveTenant(null);
  }, [mutations.isSaving]);

  const handleChange = useCallback(
    (field: keyof EditableTenant, value: string) => {
      setActiveTenant((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!activeTenant) return;
      try {
        setActionError(null);
        await mutations.saveTenant("create", activeTenant);
        setFormOpen(false);
        setActiveTenant(null);
      } catch (err) {
        setActionError(mutations.getErrorMessage(err, "Failed to create tenant"));
      }
    },
    [activeTenant, mutations],
  );

  const handleAction = useCallback(
    async (
      tenant: Tenant,
      action: TenantAction,
      owner?: { ownerName?: string; ownerEmail?: string },
    ) => {
      try {
        setActionError(null);
        const result = await mutations.runAction(tenant, action, owner);
        if ("id" in result) {
          setSelectedTenant(result);
        }
        await queryClient.invalidateQueries({
          queryKey: ["erp", "admin", "tenants"],
        });
      } catch (err) {
        setActionError(mutations.getErrorMessage(err, "Tenant action failed"));
      }
    },
    [mutations, queryClient],
  );

  const openOwnerDialog = useCallback(
    (tenant: Tenant, purpose: "activate" | "assign") => {
      setOwnerDialogTenant(tenant);
      setOwnerDialogPurpose(purpose);
      setOwnerDialogName(tenant.ownerName?.trim() ?? `${tenant.name} Owner`);
      setOwnerDialogEmail(tenant.ownerEmail?.trim() ?? "");
    },
    [],
  );

  const handleActivateClick = useCallback(
    (tenant: Tenant) => {
      if (!tenant.ownerEmail?.trim()) {
        openOwnerDialog(tenant, "activate");
        return;
      }
      void handleAction(tenant, "activate");
    },
    [handleAction, openOwnerDialog],
  );

  const handleAssignOwnerClick = useCallback(
    (tenant: Tenant) => {
      openOwnerDialog(tenant, "assign");
    },
    [openOwnerDialog],
  );

  const handleCloseOwnerDialog = useCallback(() => {
    if (mutations.isActionPending) return;
    setOwnerDialogTenant(null);
    setOwnerDialogName("");
    setOwnerDialogEmail("");
  }, [mutations.isActionPending]);

  const handleOwnerDialogSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!ownerDialogTenant) return;

      const owner = {
        ownerName: ownerDialogName.trim(),
        ownerEmail: ownerDialogEmail.trim(),
      };

      try {
        setActionError(null);
        const result =
          ownerDialogPurpose === "activate"
            ? await mutations.runAction(ownerDialogTenant, "activate", owner)
            : await mutations.assignTenantOwnerAccount(ownerDialogTenant, owner);

        if ("id" in result) {
          setSelectedTenant(result);
        }
        setOwnerDialogTenant(null);
        setOwnerDialogName("");
        setOwnerDialogEmail("");
        await queryClient.invalidateQueries({
          queryKey: ["erp", "admin", "tenants"],
        });
      } catch (err) {
        setActionError(
          mutations.getErrorMessage(
            err,
            ownerDialogPurpose === "activate"
              ? "Failed to activate tenant"
              : "Failed to assign tenant owner",
          ),
        );
      }
    },
    [
      mutations,
      ownerDialogEmail,
      ownerDialogName,
      ownerDialogPurpose,
      ownerDialogTenant,
      queryClient,
    ],
  );

  const handlePosBindingAction = useCallback(
    async (
      tenantId: string,
      terminalId: string,
      action: "revoke" | "reset",
    ) => {
      try {
        setActionError(null);
        if (action === "revoke") {
          await mutations.revokePosBinding(tenantId, terminalId);
        } else {
          await mutations.resetPosBinding(tenantId, terminalId);
        }
        await queryClient.invalidateQueries({
          queryKey: ["erp", "admin", "tenants"],
        });
      } catch (err) {
        setActionError(
          mutations.getErrorMessage(err, "POS binding action failed"),
        );
      }
    },
    [mutations, queryClient],
  );

  const rowActions: TenantRowActions = useMemo(
    () => ({
      onView: setSelectedTenant,
      onAssignOwner: handleAssignOwnerClick,
      onAction: (tenant, action) => {
        if (action === "activate") {
          handleActivateClick(tenant);
          return;
        }
        void handleAction(tenant, action);
      },
    }),
    [handleAction, handleActivateClick, handleAssignOwnerClick],
  );

  const selectedHealth = healthQuery.data;
  const posTerminals = terminalsQuery.data ?? [];

  const listRangeStart =
    serverTotal === 0 ? 0 : (page - 1) * TENANT_PAGE_SIZE + 1;
  const listRangeEnd = Math.min(page * TENANT_PAGE_SIZE, serverTotal);
  const tabFilterNote =
    totalFiltered !== tenants.length
      ? ` (${totalFiltered} match current tab on this page)`
      : "";

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-3 backdrop-blur-md sm:h-16 sm:px-4">
          <div className="flex-1" />
          <div className="hidden items-center gap-2 md:flex">
            <div className="relative w-full max-w-[420px] md:w-[320px] lg:w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tenants, owners, status, or IDs..."
                className="h-9 rounded-full pl-9"
              />
            </div>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              <span className="sr-only">Notifications</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
              <HelpCircle className="h-4 w-4" />
              <span className="sr-only">Help</span>
            </Button>
          </div>
        </header>

        <main className="space-y-4 p-4 sm:space-y-6 sm:p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Tenant Control Center
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage tenant lifecycle, health, migrations, backups, and POS bindings from Control DB summaries.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <Button className="w-full gap-1.5 rounded-full sm:w-auto" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                New tenant
              </Button>
              <div className="text-xs text-muted-foreground">
                {serverTotal} tenant{serverTotal === 1 ? "" : "s"} total
              </div>
            </div>
          </div>

          {displayError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {displayError}
            </p>
          )}

          {provisioningPollActive && (
            <p className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm text-blue-800 dark:text-blue-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              One or more tenants are pending setup. Status updates every few seconds.
            </p>
          )}

          <div className="space-y-3 border-b pb-2">
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {STATUS_TABS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusTab(value)}
                  className={`shrink-0 pb-2 text-sm font-semibold transition-colors ${
                    statusTab === value
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="md:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenants..."
                  className="h-9 rounded-full pl-9"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-6">
            <Card className="min-w-0 ring-1 ring-foreground/10">
              <CardHeader className="border-b px-4 pb-4 sm:px-6">
                <CardTitle>Tenants</CardTitle>
                <CardDescription>
                  Control DB list with safe platform summaries only.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {isLoading ? (
                  <AdminCardTableLoading message="Loading tenants..." rows={8} cols={6} />
                ) : totalFiltered === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <p>No tenants found.</p>
                    <Button size="sm" className="mt-2" onClick={handleOpenCreate}>
                      <Plus className="mr-1 h-4 w-4" />
                      Create first tenant
                    </Button>
                  </div>
                ) : (
                  <>
                    <TenantTableHeader />
                    {virtualizeList ? (
                      <VirtualizedTenantList
                        tenants={filteredTenants}
                        actions={rowActions}
                        busyTenantId={mutations.busyTenantId}
                      />
                    ) : (
                      <PaginatedTenantTable
                        tenants={filteredTenants}
                        page={1}
                        pageSize={Math.max(filteredTenants.length, 1)}
                        actions={rowActions}
                        busyTenantId={mutations.busyTenantId}
                      />
                    )}
                    <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Showing {listRangeStart} to {listRangeEnd} of {serverTotal} tenants
                        {tabFilterNote}
                        {virtualizeList ? " (virtualized scroll)" : ""}
                      </span>
                      {pageCount > 1 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="rounded-lg"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            <span className="sr-only">Previous</span>
                            &lt;
                          </Button>
                          <span className="inline-flex items-center px-2">
                            Page {page} of {pageCount}
                          </span>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="rounded-lg"
                            disabled={page >= pageCount}
                            onClick={() =>
                              setPage((p) => Math.min(pageCount, p + 1))
                            }
                          >
                            <span className="sr-only">Next</span>
                            &gt;
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="h-fit min-w-0 ring-1 ring-foreground/10">
              <CardHeader className="border-b px-4 pb-4 sm:px-6">
                <CardTitle>Tenant details</CardTitle>
                <CardDescription>
                  Health and POS summaries, with no tenant business records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pt-4 sm:px-6">
                {!selectedTenant ? (
                  <p className="text-sm text-muted-foreground">
                    Select a tenant to view health, provisioning, migration, backup, login, and POS terminal summaries.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-semibold">{selectedTenant.name}</h2>
                        <Badge
                          variant="secondary"
                          className={getTenantStatusBadgeClass(selectedTenant.status)}
                        >
                          {getTenantStatusLabel(selectedTenant.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedTenant.slug ?? selectedTenant.schemaName}
                      </p>
                    </div>

                    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <Summary label="Owner" value={selectedTenant.ownerName ?? "Missing"} />
                      <Summary label="Owner email" value={selectedTenant.ownerEmail ?? "Missing"} />
                      <Summary label="Database" value={getTenantDatabaseName(selectedTenant)} />
                      <Summary label="DB configured" value={selectedTenant.hasDatabaseUrl ? "Yes" : "No"} />
                      <Summary
                        label="DB health"
                        value={formatDatabaseHealthStatus(
                          selectedHealth?.databaseConnection ??
                            selectedTenant.databaseHealthStatus,
                        )}
                      />
                      <Summary label="Migration" value={selectedHealth?.migrationStatus ?? selectedTenant.migrationStatus} />
                      <Summary
                        label="Provisioning"
                        value={
                          selectedTenant.provisioningStatus
                            ? getProvisioningStatusLabel(
                                selectedTenant.provisioningStatus,
                              )
                            : "Not started"
                        }
                      />
                      <Summary
                        label="POS terminals"
                        value={String(
                          selectedHealth?.posTerminalCount ??
                            selectedTenant.posTerminalCount,
                        )}
                      />
                      <Summary label="Last login" value={formatTenantDate(selectedTenant.lastLoginAt ?? undefined)} />
                      <Summary label="Storage" value={bytesLabel(selectedHealth?.storageUsed ?? selectedTenant.storageUsed)} />
                      <Summary label="Last backup" value={formatTenantDate(selectedTenant.lastBackupAt ?? undefined)} />
                    </dl>

                    {tenantMissingOwner(selectedTenant) && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                          No owner configured
                        </p>
                        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                          Assign an admin owner to create the login account in this
                          tenant database.
                        </p>
                        <Button
                          size="sm"
                          className="mt-3"
                          disabled={
                            mutations.isActionPending &&
                            mutations.busyTenantId === selectedTenant.id
                          }
                          onClick={() => handleAssignOwnerClick(selectedTenant)}
                        >
                          Assign owner
                        </Button>
                      </div>
                    )}

                    {healthQuery.isFetching && (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Refreshing health...
                      </p>
                    )}

                    {selectedTenant.errorMessage && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        <p className="font-medium">Provisioning error</p>
                        <p className="mt-1">{selectedTenant.errorMessage}</p>
                      </div>
                    )}

                    {(selectedHealth?.errors ?? []).length > 0 && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        {selectedHealth?.errors.map((err) => (
                          <p key={err}>{err}</p>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">
                        POS terminal summary
                      </div>
                      {terminalsQuery.isLoading ? (
                        <p className="text-xs text-muted-foreground">Loading terminals...</p>
                      ) : posTerminals.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No Control DB POS terminals.</p>
                      ) : (
                        <div className="max-h-56 space-y-2 overflow-y-auto">
                          {posTerminals.map((terminal) => (
                            <div key={terminal.id} className="rounded-md border p-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">
                                  {terminal.displayName ?? terminal.terminalUsername ?? terminal.id}
                                </span>
                                <span className="text-muted-foreground">
                                  {terminal.bindingStatus}
                                </span>
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                Status {terminal.status}; pending outbox {terminal.pendingOutboxCount}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-full px-2.5 text-[11px]"
                                  disabled={
                                    !canRevokePosBinding(terminal.bindingStatus) ||
                                    (mutations.isActionPending &&
                                      mutations.busyTenantId === selectedTenant.id)
                                  }
                                  onClick={() =>
                                    void handlePosBindingAction(
                                      selectedTenant.id,
                                      terminal.id,
                                      "revoke",
                                    )
                                  }
                                >
                                  Revoke binding
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-full px-2.5 text-[11px]"
                                  disabled={
                                    !canResetPosBinding(terminal.bindingStatus) ||
                                    (mutations.isActionPending &&
                                      mutations.busyTenantId === selectedTenant.id)
                                  }
                                  onClick={() =>
                                    void handlePosBindingAction(
                                      selectedTenant.id,
                                      terminal.id,
                                      "reset",
                                    )
                                  }
                                >
                                  Reset binding
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <TenantFormDialog
            open={formOpen}
            mode={formMode}
            form={activeTenant ?? emptyEditableTenant()}
            viewTenant={null}
            saving={mutations.isSaving}
            onClose={handleCloseForm}
            onSubmit={(e) => void handleSubmit(e)}
            onChange={handleChange}
          />

          <TenantOwnerDialog
            open={ownerDialogTenant != null}
            tenant={ownerDialogTenant}
            purpose={ownerDialogPurpose}
            ownerName={ownerDialogName}
            ownerEmail={ownerDialogEmail}
            saving={
              mutations.isActionPending &&
              ownerDialogTenant != null &&
              mutations.busyTenantId === ownerDialogTenant.id
            }
            onClose={handleCloseOwnerDialog}
            onSubmit={(e) => void handleOwnerDialogSubmit(e)}
            onChange={(field, value) => {
              if (field === "ownerName") setOwnerDialogName(value);
              if (field === "ownerEmail") setOwnerDialogEmail(value);
            }}
          />
        </main>
      </div>
    </TooltipProvider>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 wrap-break-word font-medium">{value}</dd>
    </div>
  );
}
