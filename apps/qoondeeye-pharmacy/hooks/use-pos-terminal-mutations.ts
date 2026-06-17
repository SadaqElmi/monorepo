"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import {
  createPosTerminal,
  deactivatePosTerminal,
  reactivatePosTerminal,
  resetPosTerminalPassword,
  revokePosTerminalBinding,
  updatePosTerminal,
  type CreatePosTerminalInput,
  type UpdatePosTerminalInput,
} from "@/lib/services/pos-terminals";

export function usePosTerminalMutations(tenantSlug: string) {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["erp", "pos-terminals", tenantSlug],
    });
    await queryClient.invalidateQueries({
      queryKey: ["erp", "pos-terminal", tenantSlug],
    });
    await queryClient.invalidateQueries({
      queryKey: ["erp", "pos-terminal-activity", tenantSlug],
    });
  };

  const create = useMutation({
    mutationFn: (input: CreatePosTerminalInput) =>
      createPosTerminal(tenantSlug, input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePosTerminalInput }) =>
      updatePosTerminal(tenantSlug, id, input),
    onSuccess: invalidate,
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetPosTerminalPassword(tenantSlug, id, password),
    onSuccess: invalidate,
  });

  const revokeBinding = useMutation({
    mutationFn: (id: string) => revokePosTerminalBinding(tenantSlug, id),
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivatePosTerminal(tenantSlug, id),
    onSuccess: invalidate,
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => reactivatePosTerminal(tenantSlug, id),
    onSuccess: invalidate,
  });

  return {
    branchFacet,
    create,
    update,
    resetPassword,
    revokeBinding,
    deactivate,
    reactivate,
    invalidate,
  };
}
