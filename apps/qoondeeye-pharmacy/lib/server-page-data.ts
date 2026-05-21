import "server-only";

import {
  getServerSession,
  requireServerSession,
  requireSystemSession,
  type ServerSession,
} from "@/lib/auth-server";
import {
  loadReportPageContext,
  loadReportPageContextFromSession,
  type ReportPageContext,
} from "@/lib/server-page-props";

export type TenantListPageResult<T> = {
  session: ServerSession;
  tenantSlug: string;
  data: T;
};

/** Session gate + single tenant-scoped fetch (roles, categories, suppliers, …). */
export async function loadTenantListPage<T>(opts: {
  fetch: (tenantSlug: string) => Promise<T>;
}): Promise<TenantListPageResult<T>> {
  const session = await requireServerSession();
  const tenantSlug = session.tenantSlug!;
  const data = await opts.fetch(tenantSlug);
  return { session, tenantSlug, data };
}

export type ReportPageResult<T> = {
  ctx: ReportPageContext;
  data: T;
};

/** Report context + one report fetch. */
export async function loadReportPage<T>(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  fetch: (ctx: ReportPageContext) => Promise<T>,
  defaults?: Partial<ReportPageContext["filters"]>,
): Promise<ReportPageResult<T>> {
  const ctx = await loadReportPageContext(searchParams, defaults);
  const data = await fetch(ctx);
  return { ctx, data };
}

/** When session is already required on the page, skip duplicate session read in context. */
export async function loadReportPageWithSession<T>(
  session: ServerSession,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  fetch: (ctx: ReportPageContext) => Promise<T>,
  defaults?: Partial<ReportPageContext["filters"]>,
): Promise<ReportPageResult<T>> {
  const sp = await searchParams;
  const ctx = await loadReportPageContextFromSession(session, sp, defaults);
  const data = await fetch(ctx);
  return { ctx, data };
}

/** Parallel session resolution + report context (for pages that only need ctx). */
export async function loadReportContextParallel(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  defaults?: Partial<ReportPageContext["filters"]>,
): Promise<ReportPageContext> {
  return loadReportPageContext(searchParams, defaults);
}

export { getServerSession, requireServerSession, requireSystemSession };
