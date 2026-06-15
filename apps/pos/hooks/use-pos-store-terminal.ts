"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getPosDeviceBinding } from "@/lib/device-client";
import { getBranches } from "@/lib/services/branches";

export type PosStoreTerminalLabels = {
  storeNo: string | null;
  posTerm: string | null;
};

/** Branch code and POS terminal label for the bound device (offline fallback). */
export function usePosStoreTerminalLabels(
  tenantSlug: string | null | undefined,
): PosStoreTerminalLabels {
  const binding =
    typeof window !== "undefined" ? getPosDeviceBinding() : null;
  const branchId = binding?.branchId?.trim() || null;

  const branchesQuery = useQuery({
    queryKey: ["pos", "branches", tenantSlug ?? ""],
    enabled: Boolean(tenantSlug && branchId),
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => getBranches(tenantSlug!, { signal }),
  });

  const [labels, setLabels] = useState<PosStoreTerminalLabels>({
    storeNo: null,
    posTerm: null,
  });

  useEffect(() => {
    const posTerm =
      binding?.displayName?.trim() ||
      binding?.deviceCode?.trim() ||
      null;
    let storeNo: string | null = null;
    if (branchId && branchesQuery.data) {
      const branch = branchesQuery.data.find((b) => b.id === branchId);
      storeNo = branch?.code?.trim() || null;
    }
    setLabels({ storeNo, posTerm });
  }, [binding?.displayName, binding?.deviceCode, branchId, branchesQuery.data]);

  return labels;
}
