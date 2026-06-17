"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import { useNetworkStatus } from "@/hooks/use-network-status";
import {
  EMPTY_POS_CATALOG_VIEW,
  mapPosCatalogView,
  type PosCatalogData,
} from "@/lib/pos-catalog-view";
import { posKeys, POS_STALE_CATALOG } from "@/lib/pos-query-keys";
import {
  loadCatalogSnapshot,
  saveCatalogSnapshot,
} from "@/lib/offline/catalog-store";
import { getPosRegisterCatalog } from "@/lib/services/pos-catalog";

export type { PosCatalogData } from "@/lib/pos-catalog-view";

export async function fetchPosCatalog(
  tenantSlug: string,
  signal?: AbortSignal,
): Promise<PosCatalogData> {
  return getPosRegisterCatalog(tenantSlug, { signal });
}

export function usePosCatalog(
  tenantSlug: string | null,
  options?: {
    initialData?: PosCatalogData;
    enabled?: boolean;
  },
) {
  const branchFacet = usePosBranchFacet(tenantSlug);
  const { isOffline } = useNetworkStatus();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet) && !isOffline;
  const tenant = tenantSlug ?? "";
  const [offlineSnapshot, setOfflineSnapshot] = useState<PosCatalogData | null>(
    null,
  );

  useEffect(() => {
    if (!tenantSlug || !branchFacet) {
      setOfflineSnapshot(null);
      return;
    }
    void loadCatalogSnapshot(tenantSlug, branchFacet).then(setOfflineSnapshot);
  }, [tenantSlug, branchFacet]);

  const query = useQuery({
    queryKey: posKeys.catalog(tenant, branchFacet),
    enabled,
    staleTime: POS_STALE_CATALOG,
    refetchOnWindowFocus: false,
    initialData: options?.initialData ?? offlineSnapshot ?? undefined,
    queryFn: ({ signal }) => getPosRegisterCatalog(tenantSlug!, { signal }),
  });

  const isError = query.isError;

  const data = query.data;

  useEffect(() => {
    if (tenantSlug && branchFacet && data) {
      void saveCatalogSnapshot(tenantSlug, branchFacet, data);
    }
  }, [tenantSlug, branchFacet, data]);

  const catalogSource = data ?? offlineSnapshot;

  const view = useMemo(() => {
    if (!tenantSlug || !catalogSource) {
      return EMPTY_POS_CATALOG_VIEW;
    }
    if (isError && !offlineSnapshot) {
      return EMPTY_POS_CATALOG_VIEW;
    }
    return mapPosCatalogView(catalogSource);
  }, [tenantSlug, isError, catalogSource, offlineSnapshot]);

  return {
    data,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch: () => query.refetch(),
    catalogProducts: view.catalogProducts,
    categoryList: view.categoryList,
    batches: view.batches,
    productNameById: view.productNameById,
    barcodeToProductId: view.barcodeToProductId,
  };
}
