import {
  getClientBranchIdHeaderForApi,
  getEffectiveClientBranchId,
} from "@/lib/branch-access";

/** Stable facet for TanStack query keys; mirrors branch headers used by jsonFetch. */
export function getBranchQueryKeyFacet(): string {
  if (typeof window === "undefined") return "ssr";
  const header = getClientBranchIdHeaderForApi();
  const eff = getEffectiveClientBranchId();
  return `${header ?? "none"}|${eff ?? "none"}`;
}
