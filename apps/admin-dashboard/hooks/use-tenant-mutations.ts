import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  activateTenant,
  assignTenantOwner,
  clearTenantOwner,
  createTenant,
  createTenantBackup,
  markTenantInactive,
  resetPosTerminalBinding,
  revokePosTerminalBinding,
  runTenantMigration,
  suspendTenant,
} from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import {
  getErrorMessage,
  toCreateTenantPayload,
  type EditableTenant,
} from "@/lib/tenants/tenant-form";
import { upsertTenantInCache } from "@/lib/tenants/tenant-query-cache";
import { showTemporaryOwnerPasswordToast } from "@/lib/tenants/owner-password-toast";
import type {
  ActivateTenantResult,
  AssignTenantOwnerResult,
  CreateTenantResult,
  Tenant,
} from "@/lib/services/tenants";

type MutationCallbacks = {
  onCreateSuccess?: (tenant: CreateTenantResult) => void;
};

export function useTenantMutations(callbacks: MutationCallbacks = {}) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      callbacks.onCreateSuccess?.(tenant);
      if (tenant.temporaryOwnerPassword) {
        showTemporaryOwnerPasswordToast(tenant.temporaryOwnerPassword, {
          title: "Tenant created — temporary owner password",
          tenantName: tenant.name,
        });
      } else {
        toast.success("Tenant created", {
          description: `${tenant.name} is active after provisioning checks.`,
        });
      }
    },
  });

  const activateMutation = useMutation({
    mutationFn: ({
      tenantId,
      owner,
    }: {
      tenantId: string;
      owner?: { ownerName?: string; ownerEmail?: string };
    }) => activateTenant(tenantId, owner),
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      if (tenant.temporaryOwnerPassword) {
        showTemporaryOwnerPasswordToast(tenant.temporaryOwnerPassword, {
          title: "Tenant activated — temporary owner password",
          tenantName: tenant.name,
        });
      } else {
        toast.success("Tenant activated");
      }
    },
  });

  const assignOwnerMutation = useMutation({
    mutationFn: ({
      tenantId,
      owner,
    }: {
      tenantId: string;
      owner: { ownerName: string; ownerEmail: string };
    }) => assignTenantOwner(tenantId, owner),
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      if (tenant.temporaryOwnerPassword) {
        showTemporaryOwnerPasswordToast(tenant.temporaryOwnerPassword, {
          title: "Owner assigned — temporary password",
          tenantName: tenant.name,
        });
      } else {
        toast.success("Tenant owner assigned");
      }
    },
  });

  const suspendMutation = useMutation({
    mutationFn: suspendTenant,
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      toast.success("Tenant suspended");
    },
  });

  const inactiveMutation = useMutation({
    mutationFn: markTenantInactive,
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      toast.success("Tenant marked inactive");
    },
  });

  const migrationMutation = useMutation({
    mutationFn: runTenantMigration,
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      toast.success("Migration completed");
    },
  });

  const backupMutation = useMutation({
    mutationFn: createTenantBackup,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["erp", "admin", "tenants"],
      });
      toast.success("Backup job accepted", {
        description: "Audit-only backup request recorded.",
      });
    },
  });

  const revokeBindingMutation = useMutation({
    mutationFn: ({
      tenantId,
      terminalId,
    }: {
      tenantId: string;
      terminalId: string;
    }) => revokePosTerminalBinding(tenantId, terminalId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          ...erpKeys.adminTenants(),
          variables.tenantId,
          "pos-terminals",
        ],
      });
      toast.success("POS binding revoked");
    },
  });

  const resetBindingMutation = useMutation({
    mutationFn: ({
      tenantId,
      terminalId,
    }: {
      tenantId: string;
      terminalId: string;
    }) => resetPosTerminalBinding(tenantId, terminalId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          ...erpKeys.adminTenants(),
          variables.tenantId,
          "pos-terminals",
        ],
      });
      toast.success("POS binding reset");
    },
  });

  const clearOwnerMutation = useMutation({
    mutationFn: (tenantId: string) => clearTenantOwner(tenantId),
    onSuccess: (tenant) => {
      upsertTenantInCache(queryClient, tenant);
      toast.success("Tenant owner removed");
    },
  });

  const saveTenant = useCallback(
    async (formMode: "create" | "edit", form: EditableTenant) => {
      if (formMode !== "create") {
        throw new Error("Tenant edits are handled by explicit actions.");
      }
      return createMutation.mutateAsync(toCreateTenantPayload(form));
    },
    [createMutation],
  );

  const assignTenantOwnerAccount = useCallback(
    async (
      tenant: Tenant,
      owner: { ownerName: string; ownerEmail: string },
    ): Promise<AssignTenantOwnerResult> => {
      return assignOwnerMutation.mutateAsync({
        tenantId: tenant.id,
        owner,
      });
    },
    [assignOwnerMutation],
  );

  const clearTenantOwnerAccount = useCallback(
    async (tenantId: string) => {
      return clearOwnerMutation.mutateAsync(tenantId);
    },
    [clearOwnerMutation],
  );

  const runAction = useCallback(
    async (
      tenant: Tenant,
      action: "activate" | "suspend" | "inactive" | "migration" | "backup",
      owner?: { ownerName?: string; ownerEmail?: string },
    ): Promise<Tenant | ActivateTenantResult | { jobId: string }> => {
      if (action === "activate") {
        return activateMutation.mutateAsync({
          tenantId: tenant.id,
          owner,
        });
      }
      if (action === "suspend") return suspendMutation.mutateAsync(tenant.id);
      if (action === "inactive") return inactiveMutation.mutateAsync(tenant.id);
      if (action === "migration") {
        return migrationMutation.mutateAsync(tenant.id);
      }
      return backupMutation.mutateAsync(tenant.id);
    },
    [
      activateMutation,
      backupMutation,
      inactiveMutation,
      migrationMutation,
      suspendMutation,
    ],
  );

  const isSaving = createMutation.isPending;
  const isActionPending =
    activateMutation.isPending ||
    assignOwnerMutation.isPending ||
    clearOwnerMutation.isPending ||
    suspendMutation.isPending ||
    inactiveMutation.isPending ||
    migrationMutation.isPending ||
    backupMutation.isPending ||
    revokeBindingMutation.isPending ||
    resetBindingMutation.isPending;
  const busyTenantId = activateMutation.isPending
    ? (activateMutation.variables?.tenantId ?? null)
    : assignOwnerMutation.isPending
      ? (assignOwnerMutation.variables?.tenantId ?? null)
      : clearOwnerMutation.isPending
        ? (clearOwnerMutation.variables ?? null)
        : suspendMutation.isPending
      ? (suspendMutation.variables ?? null)
      : inactiveMutation.isPending
        ? (inactiveMutation.variables ?? null)
        : migrationMutation.isPending
          ? (migrationMutation.variables ?? null)
          : backupMutation.isPending
            ? (backupMutation.variables ?? null)
            : revokeBindingMutation.isPending
              ? (revokeBindingMutation.variables?.tenantId ?? null)
              : resetBindingMutation.isPending
                ? (resetBindingMutation.variables?.tenantId ?? null)
                : null;

  const revokePosBinding = useCallback(
    async (tenantId: string, terminalId: string) => {
      return revokeBindingMutation.mutateAsync({ tenantId, terminalId });
    },
    [revokeBindingMutation],
  );

  const resetPosBinding = useCallback(
    async (tenantId: string, terminalId: string) => {
      return resetBindingMutation.mutateAsync({ tenantId, terminalId });
    },
    [resetBindingMutation],
  );

  return {
    saveTenant,
    runAction,
    assignTenantOwnerAccount,
    clearTenantOwnerAccount,
    revokePosBinding,
    resetPosBinding,
    isSaving,
    isActionPending,
    busyTenantId,
    getErrorMessage,
  };
}
