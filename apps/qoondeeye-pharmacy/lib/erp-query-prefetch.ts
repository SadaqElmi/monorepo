import type { QueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";

import {
  branchesToMap,
  transferDtoToListRow,
} from "@/components/features/stock-transfers/transfer-mappers";
import { getStoredUser } from "@/lib/auth-client";
import { getReportBranchSnapshot } from "@/hooks/use-branch-for-reports";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import {
  getBatches,
  getBranches,
  getCategories,
  getDashboardSeries,
  getInventory,
  getProducts,
  getPurchases,
  getSales,
} from "@/lib/api";
import { getProductsCatalog } from "@/lib/services/products";
import {
  getLatestReconciliationRun,
  getReconciliationLogs,
} from "@/lib/services/reconciliation";
import {
  getTransferStatusCounts,
  listTransfersPaged,
} from "@/lib/services/transfers";

const TRANSFERS_PAGE_SIZE = 10;
const ALL_BRANCHES = "all";
const ALL_STATUSES = "all";
const RECONCILIATION_LOG_PAGE_SIZE = 50;

const inflight = new Set<string>();

function inflightKey(parts: string[]): string {
  return parts.join("\0");
}

/** Warm dashboard bundle + accounting series after ERP login (branch already in localStorage). */
export async function prefetchDashboardAfterLogin(
  queryClient: QueryClient,
  tenantSlug: string,
): Promise<void> {
  const k = inflightKey(["dash-login", tenantSlug]);
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    const branchFacet = getBranchQueryKeyFacet();
    if (!branchFacet) return;

    await queryClient.prefetchQuery({
      queryKey: erpKeys.dashboardBundle(tenantSlug, branchFacet),
      ...erpQueryOptions.list,
      queryFn: async ({ signal }) => {
        const [sales, purchases, inventory, batches, products, branches] =
          await Promise.all([
            getSales(tenantSlug, { signal }),
            getPurchases(tenantSlug, { signal }),
            getInventory(tenantSlug, { signal }),
            getBatches(tenantSlug, { signal }),
            getProducts(tenantSlug, { signal }),
            getBranches(tenantSlug, { signal }),
          ]);
        return {
          sales,
          purchases,
          inventory,
          batches,
          products,
          branches,
        };
      },
    });

    const now = new Date();
    const fromStr = format(startOfMonth(now), "yyyy-MM-dd");
    const toStr = format(now, "yyyy-MM-dd");
    const { branchId, aggregateAll } = getReportBranchSnapshot();

    await queryClient.prefetchQuery({
      queryKey: erpKeys.dashboardSeries(
        tenantSlug,
        branchFacet,
        fromStr,
        toStr,
        branchId ?? "",
        aggregateAll,
      ),
      ...erpQueryOptions.list,
      queryFn: ({ signal }) =>
        getDashboardSeries(
          tenantSlug,
          fromStr,
          toStr,
          branchId,
          aggregateAll,
          { signal },
        ),
    });
  } finally {
    inflight.delete(k);
  }
}

/** Warm semi-static catalog data (products catalog, categories, branches). */
export async function prefetchErpStaticCatalog(
  queryClient: QueryClient,
  tenantSlug: string,
): Promise<void> {
  const branchFacet = getBranchQueryKeyFacet();
  if (!branchFacet) return;

  const k = inflightKey(["static-catalog", tenantSlug, branchFacet]);
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: erpKeys.productsCatalog(tenantSlug, branchFacet),
        ...erpQueryOptions.static,
        queryFn: ({ signal }) => getProductsCatalog(tenantSlug, { signal }),
      }),
      queryClient.prefetchQuery({
        queryKey: erpKeys.categories(tenantSlug, branchFacet),
        ...erpQueryOptions.static,
        queryFn: ({ signal }) => getCategories(tenantSlug, { signal }),
      }),
      queryClient.prefetchQuery({
        queryKey: erpKeys.branches(tenantSlug, branchFacet),
        ...erpQueryOptions.static,
        queryFn: ({ signal }) => getBranches(tenantSlug, { signal }),
      }),
    ]);
  } finally {
    inflight.delete(k);
  }
}

/** Sidebar hover / submenu open — transfers list + KPI counts (matches transfers page defaults). */
async function prefetchTransfersHints(
  queryClient: QueryClient,
  tenantSlug: string,
): Promise<void> {
  const branchFacet = getBranchQueryKeyFacet();
  if (!branchFacet) return;

  const k = inflightKey(["sidebar-transfers", tenantSlug, branchFacet]);
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    const branchFilter = ALL_BRANCHES;
    const statusFilter = ALL_STATUSES;
    const page = 1;

    await queryClient.prefetchQuery({
      queryKey: erpKeys.transfersStatusCounts(
        tenantSlug,
        branchFacet,
        branchFilter,
      ),
      ...erpQueryOptions.list,
      queryFn: ({ signal }) =>
        getTransferStatusCounts(
          tenantSlug,
          branchFilter !== ALL_BRANCHES ? branchFilter : null,
          { signal },
        ),
    });

    await queryClient.prefetchQuery({
      queryKey: erpKeys.transfersList(
        tenantSlug,
        branchFacet,
        page,
        TRANSFERS_PAGE_SIZE,
        statusFilter,
        branchFilter,
      ),
      ...erpQueryOptions.list,
      queryFn: async ({ signal }) => {
        const [branches, pageRes] = await Promise.all([
          getBranches(tenantSlug, { signal }),
          listTransfersPaged(
            tenantSlug,
            {
              page,
              limit: TRANSFERS_PAGE_SIZE,
              status:
                statusFilter !== ALL_STATUSES ? statusFilter : undefined,
              branch_id:
                branchFilter !== ALL_BRANCHES ? branchFilter : undefined,
            },
            { signal },
          ),
        ]);
        const bm = branchesToMap(branches);
        const rows = pageRes.items.map((d) => transferDtoToListRow(d, bm));
        return {
          rows,
          branches,
          total: pageRes.total,
          totalPages: pageRes.totalPages,
          page: pageRes.page,
          limit: pageRes.limit,
        };
      },
    });
  } finally {
    inflight.delete(k);
  }
}

/** Sidebar — latest reconciliation run + first page of logs (matches reconciliation page defaults). */
async function prefetchReconciliationHints(
  queryClient: QueryClient,
  tenantSlug: string,
): Promise<void> {
  const branchFacet = getBranchQueryKeyFacet();
  const { branchId, aggregateAll } = getReportBranchSnapshot();
  if (!branchFacet || !branchId) return;

  const severityFilter = "all";
  const typeFilter = "all";
  const logsPage = 1;

  const k = inflightKey([
    "sidebar-recon",
    tenantSlug,
    branchFacet,
    branchId,
    String(aggregateAll),
  ]);
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    await queryClient.prefetchQuery({
      queryKey: erpKeys.reconciliation(
        tenantSlug,
        branchId,
        branchFacet,
        aggregateAll,
        severityFilter,
        typeFilter,
        logsPage,
        RECONCILIATION_LOG_PAGE_SIZE,
      ),
      ...erpQueryOptions.list,
      queryFn: async ({ signal }) => {
        const [latest, logRes] = await Promise.all([
          getLatestReconciliationRun(tenantSlug, { signal }),
          getReconciliationLogs(
            tenantSlug,
            {
              severity: undefined,
              type: undefined,
              limit: RECONCILIATION_LOG_PAGE_SIZE,
              page: logsPage,
            },
            { signal },
          ),
        ]);
        return { latest, logRes };
      },
    });
  } finally {
    inflight.delete(k);
  }
}

/** Warm catalog + branches after ERP login (avoid heavy dashboard prefetch). */
export async function prefetchErpCoreAfterLogin(
  queryClient: QueryClient,
  tenantSlug: string,
): Promise<void> {
  await prefetchErpStaticCatalog(queryClient, tenantSlug);
}

/** Stock page: prefetch inventory, products, and branches in parallel. */
export async function prefetchErpInventoryList(
  queryClient: QueryClient,
  tenantSlug: string,
): Promise<void> {
  const branchFacet = getBranchQueryKeyFacet();
  if (!branchFacet) return;

  const k = inflightKey(["inventory-list", tenantSlug, branchFacet]);
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: erpKeys.inventory(tenantSlug, branchFacet),
        ...erpQueryOptions.list,
        queryFn: ({ signal }) => getInventory(tenantSlug, { signal }),
      }),
      queryClient.prefetchQuery({
        queryKey: erpKeys.products(tenantSlug, branchFacet),
        ...erpQueryOptions.list,
        queryFn: ({ signal }) => getProducts(tenantSlug, { signal }),
      }),
      queryClient.prefetchQuery({
        queryKey: erpKeys.branches(tenantSlug, branchFacet),
        ...erpQueryOptions.static,
        queryFn: ({ signal }) => getBranches(tenantSlug, { signal }),
      }),
    ]);
  } finally {
    inflight.delete(k);
  }
}

/**
 * Call from sidebar when the user hovers a collapsible group or opens it.
 * Guards duplicate work with module-level in-flight keys.
 */
export function prefetchErpSidebarHints(
  queryClient: QueryClient,
  moduleTitle: string,
): void {
  const slug = getStoredUser()?.tenantSlug?.trim();
  if (!slug || slug.length === 0) return;

  if (moduleTitle === "Inventory") {
    void prefetchErpStaticCatalog(queryClient, slug);
    void prefetchTransfersHints(queryClient, slug);
    return;
  }
  if (moduleTitle === "Customers") {
    void prefetchErpStaticCatalog(queryClient, slug);
    return;
  }
  if (moduleTitle === "Finance") {
    void prefetchReconciliationHints(queryClient, slug);
  }
}
