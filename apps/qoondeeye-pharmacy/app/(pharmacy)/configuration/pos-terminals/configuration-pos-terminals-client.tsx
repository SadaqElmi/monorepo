"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Monitor, Plus } from "lucide-react";

import { TerminalFilters, type TerminalFilterState } from "./components/terminal-filters";
import { TerminalPagination } from "./components/terminal-pagination";
import { TerminalTable } from "./components/terminal-table";
import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import {
  ConfigurationErrorBanner,
  ConfigurationSuccessBanner,
} from "@/components/configuration/configuration-status-banner";
import { Button } from "@/components/ui/button";
import { TerminalDeactivateDialog } from "./components/terminal-deactivate-dialog";
import {
  TerminalFormDialog,
  type TerminalFormState,
} from "./components/terminal-form-dialog";
import { TerminalResetPasswordDialog } from "./components/terminal-reset-password-dialog";
import { TerminalRevokeDialog } from "./components/terminal-revoke-dialog";
import { useErpPosTerminals } from "@/hooks/queries/use-erp-pos-terminals";
import { usePosTerminalMutations } from "@/hooks/use-pos-terminal-mutations";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { getConfigurationBranches } from "@/lib/services/branches";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { hasEffectivePermission } from "@/lib/permissions";
import type { PosTerminal } from "@/lib/services/pos-terminals";
const EMPTY_FORM: TerminalFormState = {
  displayName: "",
  terminalUsername: "",
  password: "",
  branchId: "",
  status: "active",
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

export default function ConfigurationPosTerminalsClient() {
  const branchFacet = useErpBranchFacet();
  const storedUser = useMemo(() => getStoredUser(), []);
  const tenantSlug = storedUser?.tenantSlug ?? "";
  const permissions = storedUser?.permissions ?? [];
  const role = storedUser?.role?.toLowerCase();
  const canManage =
    role === "admin" ||
    role === "manager" ||
    hasEffectivePermission(permissions, "manage_pos_terminals");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filters, setFilters] = useState<TerminalFilterState>({
    q: "",
    branchId: "",
    status: "",
    bindingStatus: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTerminal, setEditTerminal] = useState<PosTerminal | null>(null);
  const [resetTerminal, setResetTerminal] = useState<PosTerminal | null>(null);
  const [revokeTerminal, setRevokeTerminal] = useState<PosTerminal | null>(null);
  const [deactivateTerminal, setDeactivateTerminal] = useState<PosTerminal | null>(null);
  const [form, setForm] = useState<TerminalFormState>(EMPTY_FORM);
  const [resetPassword, setResetPassword] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filters.branchId, filters.status, filters.bindingStatus, pageSize]);

  const branchesQuery = useQuery({
    queryKey: [...erpKeys.branches(tenantSlug, branchFacet), "configuration"],
    queryFn: ({ signal }) => getConfigurationBranches(tenantSlug, { signal }),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
  });
  const branches = branchesQuery.data ?? [];

  const terminalsQuery = useErpPosTerminals(tenantSlug, {
    page,
    limit: pageSize,
    q: debouncedQ || undefined,
    branchId: filters.branchId || undefined,
    status: filters.status || undefined,
    bindingStatus: filters.bindingStatus || undefined,
  });

  const mutations = usePosTerminalMutations(tenantSlug);
  const saving = mutations.create.isPending || mutations.update.isPending ||
    mutations.resetPassword.isPending || mutations.revokeBinding.isPending ||
    mutations.deactivate.isPending || mutations.reactivate.isPending;

  const terminals = terminalsQuery.data?.items ?? [];
  const total = terminalsQuery.data?.total ?? 0;
  const loading = terminalsQuery.isPending;
  const loadError = terminalsQuery.error;
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load POS terminals."
        : null);

  const hasFilters = Boolean(
    debouncedQ || filters.branchId || filters.status || filters.bindingStatus,
  );
  const activeCount = terminals.filter((t) => t.status === "active").length;

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const openCreate = () => {
    resetMessages();
    setForm({
      ...EMPTY_FORM,
      branchId: branches[0]?.id?.trim() ?? "",
    });
    setCreateOpen(true);
  };

  const openEdit = useCallback((terminal: PosTerminal) => {
    resetMessages();
    setEditTerminal(terminal);
    setForm({
      displayName: terminal.displayName ?? "",
      terminalUsername: terminal.terminalUsername ?? "",
      password: "",
      branchId: terminal.branchId?.trim() ?? "",
      status: terminal.status === "inactive" ? "inactive" : "active",
    });
  }, []);

  const validateCreate = (): string | null => {
    if (!form.displayName.trim()) return "Enter terminal name.";
    if (form.terminalUsername.trim().length < 3) return "Username must be at least 3 characters.";
    if (!USERNAME_RE.test(form.terminalUsername.trim())) {
      return "Username may only contain letters, numbers, underscores, and hyphens.";
    }
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (!form.branchId) return "Select a branch.";
    return null;
  };

  const submitCreate = async () => {
    resetMessages();
    const validationError = validateCreate();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await mutations.create.mutateAsync({
        displayName: form.displayName.trim(),
        terminalUsername: form.terminalUsername.trim(),
        password: form.password,
        branchId: form.branchId,
        status: form.status,
      });
      setCreateOpen(false);
      setSuccess("POS terminal created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create terminal.");
    }
  };

  const submitEdit = async () => {
    if (!editTerminal) return;
    resetMessages();
    if (!form.displayName.trim() || !form.branchId) {
      setError("Enter terminal name and branch.");
      return;
    }
    try {
      await mutations.update.mutateAsync({
        id: editTerminal.id,
        input: {
          displayName: form.displayName.trim(),
          branchId: form.branchId,
          status: form.status,
        },
      });
      setEditTerminal(null);
      setSuccess("POS terminal updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update terminal.");
    }
  };

  const submitResetPassword = async () => {
    if (!resetTerminal) return;
    resetMessages();
    if (resetPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      await mutations.resetPassword.mutateAsync({
        id: resetTerminal.id,
        password: resetPassword,
      });
      setResetTerminal(null);
      setResetPassword("");
      setSuccess("Terminal password reset. Device must be set up again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password.");
    }
  };

  const submitRevoke = async () => {
    if (!revokeTerminal) return;
    resetMessages();
    try {
      await mutations.revokeBinding.mutateAsync(revokeTerminal.id);
      setRevokeTerminal(null);
      setSuccess("Device binding revoked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke binding.");
    }
  };

  const submitDeactivate = async () => {
    if (!deactivateTerminal) return;
    resetMessages();
    try {
      await mutations.deactivate.mutateAsync(deactivateTerminal.id);
      setDeactivateTerminal(null);
      setSuccess("POS terminal deactivated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate terminal.");
    }
  };

  const submitReactivate = async (terminal: PosTerminal) => {
    resetMessages();
    try {
      await mutations.reactivate.mutateAsync(terminal.id);
      setSuccess("POS terminal reactivated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reactivate terminal.");
    }
  };

  return (
    <ConfigurationModuleShell
      title="POS Terminals"
      description="Register POS terminals for your branches. Cashiers activate each device once with the terminal username and password, then sign in daily with Staff ID and PIN."
      stat={{
        icon: Monitor,
        value: `${activeCount} active on this page`,
      }}
      headerEnd={
        canManage ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add terminal
          </Button>
        ) : null
      }
    >
      {displayError ? <ConfigurationErrorBanner message={displayError} /> : null}
      {success ? <ConfigurationSuccessBanner message={success} /> : null}

      <TerminalFilters
        filters={filters}
        onChange={setFilters}
        branches={branches}
        onSearchChange={(q) => setFilters((prev) => ({ ...prev, q }))}
      />

      <TerminalTable
        terminals={terminals}
        loading={loading}
        canManage={canManage}
        hasFilters={hasFilters}
        onClearFilters={() =>
          setFilters({ q: "", branchId: "", status: "", bindingStatus: "" })
        }
        onEdit={openEdit}
        onResetPassword={(t) => {
          resetMessages();
          setResetTerminal(t);
          setResetPassword("");
        }}
        onRevoke={(t) => {
          resetMessages();
          setRevokeTerminal(t);
        }}
        onDeactivate={(t) => {
          resetMessages();
          setDeactivateTerminal(t);
        }}
        onReactivate={submitReactivate}
        deactivatingId={
          mutations.deactivate.isPending ? deactivateTerminal?.id ?? null : null
        }
      />

      <TerminalPagination
        page={page}
        limit={pageSize}
        total={total}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageChange={setPage}
        onPageSizeChange={(size) =>
          setPageSize(size as (typeof PAGE_SIZE_OPTIONS)[number])
        }
        isFetching={terminalsQuery.isFetching}
      />

      <TerminalFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        setForm={setForm}
        branches={branches}
        branchesLoading={branchesQuery.isPending}
        saving={saving}
        onSubmit={submitCreate}
      />

      <TerminalFormDialog
        mode="edit"
        open={Boolean(editTerminal)}
        onOpenChange={(open) => !open && setEditTerminal(null)}
        form={form}
        setForm={setForm}
        branches={branches}
        branchesLoading={branchesQuery.isPending}
        selectedBranchName={editTerminal?.branchName}
        terminalId={editTerminal?.id}
        saving={saving}
        onSubmit={submitEdit}
      />

      <TerminalResetPasswordDialog
        open={Boolean(resetTerminal)}
        onOpenChange={(open) => !open && setResetTerminal(null)}
        displayName={resetTerminal?.displayName}
        terminalUsername={resetTerminal?.terminalUsername}
        password={resetPassword}
        onPasswordChange={setResetPassword}
        saving={saving}
        onSubmit={submitResetPassword}
      />

      <TerminalRevokeDialog
        open={Boolean(revokeTerminal)}
        onOpenChange={(open) => !open && setRevokeTerminal(null)}
        displayName={revokeTerminal?.displayName}
        saving={saving}
        onSubmit={submitRevoke}
      />

      <TerminalDeactivateDialog
        open={Boolean(deactivateTerminal)}
        onOpenChange={(open) => !open && setDeactivateTerminal(null)}
        displayName={deactivateTerminal?.displayName}
        saving={saving}
        onSubmit={submitDeactivate}
      />
    </ConfigurationModuleShell>
  );
}
