import "server-only";

import { getServerSession, type ServerSession } from "@/lib/auth-server";
import { getServerBranchScope } from "@/lib/branch-scope-server";
import { computeReportScopeHash } from "@/lib/accounting-report-query";

export type ReportPageContext = {
  tenantSlug: string;
  branchId: string | undefined;
  aggregateAll: boolean;
  scopeHash: string;
  filters: {
    asOf?: string;
    from?: string;
    to?: string;
    periodKey?: string;
    entityId?: string;
    tab?: string;
    compareAsOf?: string;
    compareFrom?: string;
    compareTo?: string;
    partnerKind?: string;
    partnerId?: string;
  };
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function buildReportPageContext(
  session: ServerSession,
  sp: Record<string, string | string[] | undefined>,
  defaults?: Partial<ReportPageContext["filters"]>,
  branch?: Awaited<ReturnType<typeof getServerBranchScope>>,
): ReportPageContext {
  const filters = {
    asOf: firstParam(sp.asOf) ?? defaults?.asOf,
    from: firstParam(sp.from) ?? defaults?.from,
    to: firstParam(sp.to) ?? defaults?.to,
    periodKey: firstParam(sp.periodKey) ?? defaults?.periodKey,
    entityId: firstParam(sp.entityId) ?? defaults?.entityId,
    tab: firstParam(sp.tab) ?? defaults?.tab,
    compareAsOf: firstParam(sp.compareAsOf) ?? defaults?.compareAsOf,
    compareFrom: firstParam(sp.compareFrom) ?? defaults?.compareFrom,
    compareTo: firstParam(sp.compareTo) ?? defaults?.compareTo,
    partnerKind: firstParam(sp.partnerKind) ?? defaults?.partnerKind,
    partnerId: firstParam(sp.partnerId) ?? defaults?.partnerId,
  };

  const branchScope = branch ?? {
    branchId: undefined as string | undefined,
    aggregateAll: false,
  };

  const entityId = filters.entityId?.trim() || undefined;
  const scopeHash = entityId
    ? `scope:entity:${entityId}`
    : computeReportScopeHash(
        branchScope.branchId,
        branchScope.aggregateAll ?? false,
      );

  return {
    tenantSlug: session.tenantSlug!,
    branchId: branchScope.branchId,
    aggregateAll: branchScope.aggregateAll ?? false,
    scopeHash,
    filters,
  };
}

/** Build report context when session is already loaded (avoids duplicate session read). */
export async function loadReportPageContextFromSession(
  session: ServerSession,
  sp: Record<string, string | string[] | undefined>,
  defaults?: Partial<ReportPageContext["filters"]>,
): Promise<ReportPageContext> {
  const branch = await getServerBranchScope(session);
  return buildReportPageContext(session, sp, defaults, branch);
}

export async function loadReportPageContext(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  defaults?: Partial<ReportPageContext["filters"]>,
): Promise<ReportPageContext> {
  const [session, sp] = await Promise.all([getServerSession(), searchParams]);
  if (!session?.tenantSlug) {
    throw new Error("Unauthorized");
  }
  return loadReportPageContextFromSession(session, sp, defaults);
}
