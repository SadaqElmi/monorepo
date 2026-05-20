import { sanitizeBranchIdForQuery } from "@/lib/branch-scope";

export function computeReportScopeHash(
  branchId?: string,
  aggregateAll?: boolean,
  consolidated?: boolean,
): string {
  const b = sanitizeBranchIdForQuery(branchId);
  const base = `agg:${aggregateAll ? 1 : 0}|branch:${b ?? "none"}|c:${consolidated ? 1 : 0}`;
  let h = 0;
  for (let i = 0; i < base.length; i += 1) {
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function appendReportBranchQuery(
  q: URLSearchParams,
  branchId?: string,
  aggregateAll?: boolean,
  opts?: { consolidated?: boolean },
) {
  const b = sanitizeBranchIdForQuery(branchId);
  if (aggregateAll) q.set("aggregateAll", "true");
  else if (b) q.set("branchId", b);
  if (opts?.consolidated) q.set("consolidated", "true");
  q.set(
    "scopeHash",
    computeReportScopeHash(branchId, aggregateAll, opts?.consolidated),
  );
}
