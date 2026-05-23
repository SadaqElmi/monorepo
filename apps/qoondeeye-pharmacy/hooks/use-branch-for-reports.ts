"use client";

import * as React from "react";

import { getResolvedStoredUser } from "@/lib/auth-client";
import { hasGlobalBranchAccess } from "@/lib/branch-access";
import { readBranchIdFromStorageForApi } from "@/lib/branch-scope";
import { computeReportScopeHash } from "@/lib/services/accounting";

function readBranchNameFromStorage(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("branchName")?.trim();
    return raw && raw.length ? raw : undefined;
  } catch {
    return undefined;
  }
}

function readAllBranchesSelected(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("branchId")?.trim().toLowerCase() === "all";
  } catch {
    return false;
  }
}

/** Branch scope passed to report API queryFns — read at fetch time, not from render closure. */
export type ReportBranchScope = {
  branchId: string | undefined;
  aggregateAll: boolean;
  branchName?: string;
};

/**
 * Current branch scope from localStorage + user role. Call at the start of every
 * `/api/reports/*` queryFn so `branchId` query params match `x-branch-id`.
 */
export function getReportBranchSnapshot(): ReportBranchScope {
  return computeReportBranch();
}

function computeReportBranch(): {
  branchId: string | undefined;
  aggregateAll: boolean;
  branchName?: string;
} {
  if (typeof window === "undefined") {
    return { branchId: undefined, aggregateAll: false, branchName: undefined };
  }
  const user = getResolvedStoredUser();
  const aggregateAll =
    hasGlobalBranchAccess(user?.role, user?.canViewAllBranches) &&
    readAllBranchesSelected();
  const branchId = readBranchIdFromStorageForApi();
  const branchName = aggregateAll ? "All allowed branches" : readBranchNameFromStorage();
  return { branchId, aggregateAll, branchName };
}

export type ReportScopeBadgeState = {
  label: string;
  isAllBranches: boolean;
  adminOverrideWarning?: string;
  scopeHash: string;
};

export function useReportScopeBadge(): ReportScopeBadgeState {
  const { branchId, aggregateAll, branchName } = useReportBranchQuery();
  const user = getResolvedStoredUser();
  const label = aggregateAll
    ? "All allowed branches"
    : branchId
      ? branchName
        ? `Branch: ${branchName}`
        : `Branch ${branchId.slice(0, 8)}...`
      : "No branch selected";
  return {
    label,
    isAllBranches: aggregateAll,
    adminOverrideWarning:
      aggregateAll && hasGlobalBranchAccess(user?.role, user?.canViewAllBranches)
        ? "You are viewing ALL branches"
        : undefined,
    scopeHash: computeReportScopeHash(branchId, aggregateAll),
  };
}

/**
 * Branch scope for financial report APIs: a single `branchId`, or
 * `aggregateAll` when an admin/owner selects "All branches" in the team switcher.
 */
export function useReportBranchQuery(): {
  branchId: string | undefined;
  aggregateAll: boolean;
  branchName?: string;
} {
  const [state, setState] = React.useState(computeReportBranch);

  // SSR seeds `aggregateAll: false` because `window` is undefined; re-sync after
  // hydration so "All branches" (localStorage `branchId === "all"`) is reflected.
  React.useEffect(() => {
    setState(computeReportBranch());
  }, []);

  React.useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { branchId?: string | null; branchName?: string }
        | undefined;
      if (detail && "branchId" in detail && detail.branchId === null) {
        setState(computeReportBranch());
        return;
      }
      const id = detail?.branchId;
      if (id) {
        const trimmed = id.trim();
        const user = getResolvedStoredUser();
        if (
          trimmed.toLowerCase() === "all" &&
          hasGlobalBranchAccess(user?.role, user?.canViewAllBranches)
        ) {
          setState({
            branchId: undefined,
            aggregateAll: true,
            branchName: "All allowed branches",
          });
          return;
        }
        setState({
          branchId: trimmed || undefined,
          aggregateAll: false,
          branchName: detail?.branchName?.trim() || readBranchNameFromStorage(),
        });
        return;
      }
      setState(computeReportBranch());
    };
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);

  return state;
}

/**
 * Single-branch UUID for report APIs, or undefined when "All branches" is selected
 * (use `aggregateAll` from {@link useReportBranchQuery} for consolidated reports).
 */
export function useBranchIdForReports(): string | undefined {
  return useReportBranchQuery().branchId;
}
