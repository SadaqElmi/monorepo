import "server-only";

import { cache } from "react";

import type { ReportPageContext } from "@/lib/server-page-props";
import { serverJsonFetch } from "@/lib/services/server-http";
import { PURCHASES_PREFIX } from "@/lib/services/endpoints";
import type { Purchase } from "@/lib/services/purchases";

const cachedGet = cache(
  async <T>(tenantSlug: string, url: string): Promise<T> =>
    serverJsonFetch<T>(url, { tenantSlug }),
);

export async function getPurchasesServer(
  ctx: ReportPageContext,
): Promise<Purchase[]> {
  const q = new URLSearchParams();
  if (ctx.branchId) q.set("branchId", ctx.branchId);
  const qs = q.toString();
  return cachedGet(
    ctx.tenantSlug,
    `${PURCHASES_PREFIX}${qs ? `?${qs}` : ""}`,
  );
}
