import { BRANCHES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type BranchSummary = {
  id: string;
  name: string | null;
  code: string | null;
};

export async function getBranches(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<BranchSummary[]> {
  return jsonFetch<BranchSummary[]>(BRANCHES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}
