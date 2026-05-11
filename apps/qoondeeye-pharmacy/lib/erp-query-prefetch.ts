import type { QueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";

import {
  branchesToMap,
  transferDtoToListRow,
} from "@/components/features/stock-transfers/transfer-mappers";
import { getStoredUser } from "@/lib/auth-client";
import { getReportBranchSnapshot } from "@/hooks/use-branch-for-reports";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import {
  getBatches,
  getBranches,
  getDashboardSeries,
  getInventory,
  getProducts,
  getPurchases,
  getSales,
} from "@/lib/api";
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
      queryKey: ["erp", "dashboard", "bundle", tenantSlug, branchFacet],
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
      queryKey: [
        "erp",
        "dashboard",
        "series",
        tenantSlug,
        branchFacet,
        fromStr,
        toStr,
        branchId ?? "",
        aggregateAll,
      ],
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
      queryKey: [
        "erp",
        "transfers",
        "status-counts",
        tenantSlug,
        branchFacet,
        branchFilter,
      ],
      queryFn: ({ signal }) =>
        getTransferStatusCounts(
          tenantSlug,
          branchFilter !== ALL_BRANCHES ? branchFilter : null,
          { signal },
        ),
    });

    await queryClient.prefetchQuery({
      queryKey: [
        "erp",
        "transfers",
        "list",
        tenantSlug,
        branchFacet,
        page,
        TRANSFERS_PAGE_SIZE,
        statusFilter,
        branchFilter,
      ],
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
      queryKey: [
        "erp",
        "reconciliation",
        tenantSlug,
        branchId,
        branchFacet,
        aggregateAll,
        severityFilter,
        typeFilter,
        logsPage,
        RECONCILIATION_LOG_PAGE_SIZE,
      ],
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
    void prefetchTransfersHints(queryClient, slug);
    return;
  }
  if (moduleTitle === "Finance") {
    void prefetchReconciliationHints(queryClient, slug);
  }
}
