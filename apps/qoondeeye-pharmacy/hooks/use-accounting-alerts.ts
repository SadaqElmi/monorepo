"use client";

import * as React from "react";

import { getResolvedStoredUser, getStoredUser } from "@/lib/auth-client";
import { hasGlobalBranchAccess } from "@/lib/branch-access";
import { readBranchIdFromStorageForApi } from "@/lib/branch-scope";
import { getAccountingAlerts } from "@/lib/services/accounting";

function readAllBranchesSelected(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("branchId")?.trim().toLowerCase() === "all";
  } catch {
    return false;
  }
}

function currentScope() {
  const user = getResolvedStoredUser();
  const canAll = hasGlobalBranchAccess(user?.role, user?.canViewAllBranches);
  return {
    branchId: readBranchIdFromStorageForApi(),
    aggregateAll: canAll && readAllBranchesSelected(),
  };
}

export type AccountingAlertStats = {
  total: number;
  critical: number;
  warning: number;
};

export function useAccountingAlerts(pollMs = 45_000) {
  const [stats, setStats] = React.useState<AccountingAlertStats>({
    total: 0,
    critical: 0,
    warning: 0,
  });
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    const tenantSlug = getStoredUser()?.tenantSlug;
    if (!tenantSlug) return;
    setLoading(true);
    try {
      const scope = currentScope();
      const res = await getAccountingAlerts(
        tenantSlug,
        scope.branchId,
        scope.aggregateAll,
      );
      const critical = (res.items ?? []).filter(
        (item) => item.severity === "critical",
      ).length;
      const warning = (res.items ?? []).filter(
        (item) => item.severity === "warning",
      ).length;
      setStats({
        total: (res.items ?? []).length,
        critical,
        warning,
      });
    } catch {
      // Keep previous count if polling fails.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      void load();
    }, Math.max(10_000, pollMs));
    return () => window.clearInterval(t);
  }, [load, pollMs]);

  React.useEffect(() => {
    const handler = () => void load();
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, [load]);

  return { stats, loading, refresh: load };
}
