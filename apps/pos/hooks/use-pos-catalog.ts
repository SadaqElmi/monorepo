"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import {
  EMPTY_POS_CATALOG_VIEW,
  mapPosCatalogView,
  type PosCatalogData,
} from "@/lib/pos-catalog-view";
import { posKeys, POS_STALE_CATALOG } from "@/lib/pos-query-keys";
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
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);
  const tenant = tenantSlug ?? "";

  const query = useQuery({
    queryKey: posKeys.catalog(tenant, branchFacet),
    enabled,
    staleTime: POS_STALE_CATALOG,
    refetchOnWindowFocus: false,
    initialData: options?.initialData,
    queryFn: ({ signal }) => getPosRegisterCatalog(tenantSlug!, { signal }),
  });

  const isError = query.isError;

  const data = query.data;

  const view = useMemo(() => {
    if (!tenantSlug || isError || !data) {
      return EMPTY_POS_CATALOG_VIEW;
    }
    return mapPosCatalogView(data);
  }, [tenantSlug, isError, data]);

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
