import { format, startOfMonth } from "date-fns";

import { loadReportPageContext } from "@/lib/server-page-props";
import {
  getBatchesServer,
  getBranchesServer,
  getDashboardSeriesServer,
  getInventoryServer,
  getProductsServer,
  getPurchasesServerRaw,
  getSalesServer,
  getTopProductsServer,
} from "@/lib/services/api.server";
import DashboardPageClient from "./dashboard-client";

export default async function DashboardPageContent() {
  const ctx = await loadReportPageContext(Promise.resolve({}));
  const tenantSlug = ctx.tenantSlug;

  const fromStr = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const toStr = format(new Date(), "yyyy-MM-dd");

  let initialBundle: {
    sales: Awaited<ReturnType<typeof getSalesServer>>;
    purchases: Awaited<ReturnType<typeof getPurchasesServerRaw>>;
    inventory: Awaited<ReturnType<typeof getInventoryServer>>;
    batches: Awaited<ReturnType<typeof getBatchesServer>>;
    products: Awaited<ReturnType<typeof getProductsServer>>;
    branches: Awaited<ReturnType<typeof getBranchesServer>>;
  } | undefined;

  let initialSeries: Awaited<ReturnType<typeof getDashboardSeriesServer>> | null =
    null;
  let initialTopProducts: Awaited<ReturnType<typeof getTopProductsServer>> | null =
    null;

  const hasBranchScope = Boolean(ctx.branchId || ctx.aggregateAll);

  try {
    const bundlePromise = Promise.all([
      getSalesServer(tenantSlug),
      getPurchasesServerRaw(tenantSlug),
      getInventoryServer(tenantSlug),
      getBatchesServer(tenantSlug),
      getProductsServer(tenantSlug),
      getBranchesServer(tenantSlug),
    ]);

    const seriesPromise = hasBranchScope
      ? getDashboardSeriesServer(
          tenantSlug,
          fromStr,
          toStr,
          ctx.branchId,
          ctx.aggregateAll,
        )
      : Promise.resolve(null);

    const topProductsPromise = ctx.branchId
      ? getTopProductsServer(
          tenantSlug,
          fromStr,
          toStr,
          ctx.branchId,
          8,
          "revenue",
          ctx.aggregateAll,
        )
      : Promise.resolve(null);

    const [bundleResult, seriesResult, topProductsResult] = await Promise.all([
      bundlePromise,
      seriesPromise,
      topProductsPromise,
    ]);

    const [sales, purchases, inventory, batches, products, branches] =
      bundleResult;
    initialBundle = {
      sales,
      purchases,
      inventory,
      batches,
      products,
      branches,
    };
    initialSeries = seriesResult;
    initialTopProducts = topProductsResult;
  } catch {
    initialBundle = undefined;
    initialSeries = null;
    initialTopProducts = null;
  }

  return (
    <DashboardPageClient
      tenantSlug={tenantSlug}
      initialBundle={initialBundle}
      initialSeries={initialSeries}
      initialTopProducts={initialTopProducts}
      serverPrefetched={Boolean(initialBundle)}
    />
  );
}
