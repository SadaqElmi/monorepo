"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { COAGridView } from "@/components/accounting/chart-of-accounts/coa-grid-view";
import {
  COANavbar,
  type CoaViewMode,
} from "@/components/accounting/chart-of-accounts/coa-navbar";
import { COASidebar } from "@/components/accounting/chart-of-accounts/coa-sidebar";
import { COATableView } from "@/components/accounting/chart-of-accounts/coa-table-view";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { groupCoaByRoot, sortCoaTree } from "@/lib/accounting-display";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { readBranchIdFromStorageForApi } from "@/lib/branch-scope";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import {
  getAccounts,
  updateAccount,
  type ChartAccountRow,
} from "@/lib/services/accounting";

export type ChartOfAccountsPageClientProps = {
  initialAccounts?: ChartAccountRow[] | null;
  serverPrefetched?: boolean;
};

export default function AccountingChartOfAccountsPage({
  initialAccounts = null,
  serverPrefetched = false,
}: ChartOfAccountsPageClientProps = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [initialBranchFacet] = React.useState(branchFacet);
  const [storedUser] = React.useState(() => getResolvedStoredUser());
  const [tenantSlug] = React.useState(
    () => storedUser?.tenantSlug?.trim() ?? "",
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(
    null,
  );
  const [viewMode, setViewMode] = React.useState<CoaViewMode>("table");
  const [branchScopeKey, setBranchScopeKey] = React.useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const v = localStorage.getItem("branchId")?.trim() ?? "";
      return v || "all";
    } catch {
      return "all";
    }
  });
  const [initialBranchScopeKey] = React.useState(branchScopeKey);

  React.useEffect(() => {
    const syncBranchScope = () => {
      try {
        const v = localStorage.getItem("branchId")?.trim() ?? "";
        setBranchScopeKey(v || "all");
      } catch {
        setBranchScopeKey("all");
      }
      setSelectedGroupId(null);
    };
    const onBranch = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { branchId?: string | null };
      if (detail && "branchId" in detail) {
        setBranchScopeKey(detail.branchId ?? "all");
      } else {
        syncBranchScope();
      }
      setSelectedGroupId(null);
    };
    window.addEventListener("storage", syncBranchScope);
    window.addEventListener("activeBranchChanged", onBranch as EventListener);
    return () => {
      window.removeEventListener("storage", syncBranchScope);
      window.removeEventListener(
        "activeBranchChanged",
        onBranch as EventListener,
      );
    };
  }, []);

  const accountsQueryKey = React.useMemo(
    () =>
      erpKeys.accounts(
        tenantSlug,
        branchFacet,
        branchScopeKey === "all" ? undefined : branchScopeKey,
      ),
    [branchFacet, branchScopeKey, tenantSlug],
  );
  const useServerInitialData =
    serverPrefetched &&
    Boolean(initialAccounts?.length) &&
    branchFacet === initialBranchFacet &&
    branchScopeKey === initialBranchScopeKey;
  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => getAccounts(tenantSlug, readBranchIdFromStorageForApi()),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    initialData: useServerInitialData ? initialAccounts! : undefined,
  });
  const accounts = React.useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data],
  );
  const loading =
    accountsQuery.isPending ||
    (accountsQuery.isFetching && accounts.length === 0);
  const loadError = accountsQuery.error;
  const displayError =
    loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load chart of accounts"
        : null;

  const role = storedUser?.role?.trim().toLowerCase() ?? "";
  const permissions = Array.isArray(storedUser?.permissions)
    ? storedUser.permissions
    : [];
  const canManageAccounts =
    permissions.includes("manage_accounting_configuration") ||
    (permissions.length === 0 &&
      (role === "admin" ||
        role === "manager" ||
        role === "owner" ||
        role === "super_admin"));

  const coaGroups = React.useMemo(
    () => groupCoaByRoot(sortCoaTree(accounts)),
    [accounts],
  );

  const groupAccountIds = React.useMemo(() => {
    if (!selectedGroupId) return null;
    const group = coaGroups.find((entry) => entry.id === selectedGroupId);
    if (!group) return null;
    return new Set(group.rows.map((row) => row.id));
  }, [coaGroups, selectedGroupId]);

  const filteredAccounts = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return accounts.filter((account) => {
      if (groupAccountIds && !groupAccountIds.has(account.id)) {
        return false;
      }
      if (!query) return true;
      return (
        (account.code ?? "").toLowerCase().includes(query) ||
        account.name.toLowerCase().includes(query) ||
        account.account_type.toLowerCase().includes(query) ||
        (account.account_key ?? "").toLowerCase().includes(query)
      );
    });
  }, [accounts, groupAccountIds, searchQuery]);

  const displayAccounts = React.useMemo(
    () =>
      filteredAccounts.filter(
        (account) =>
          !(account.account_type === "section" && account.parent_id === null),
      ),
    [filteredAccounts],
  );

  const openAccount = React.useCallback(
    (account: ChartAccountRow) => {
      router.push(`/accounting/chart-of-accounts/${account.id}`);
    },
    [router],
  );

  const patchAccountMutation = useMutation({
    mutationFn: ({
      accountId,
      patch,
    }: {
      accountId: string;
      patch: Parameters<typeof updateAccount>[2];
    }) => updateAccount(tenantSlug, accountId, patch),
    onSuccess: (saved) => {
      queryClient.setQueryData<ChartAccountRow[]>(
        accountsQueryKey,
        (current) =>
          current?.map((account) =>
            account.id === saved.id ? saved : account,
          ) ?? [],
      );
      queryClient.setQueryData(
        erpKeys.account(tenantSlug, branchFacet, saved.id),
        saved,
      );
    },
    onError: (error) => {
      toast.error("Could not update account", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  const handleActiveChange = React.useCallback(
    (account: ChartAccountRow, active: boolean) => {
      if (!canManageAccounts || account.active === active) return;
      patchAccountMutation.mutate({
        accountId: account.id,
        patch: { active },
      });
    },
    [canManageAccounts, patchAccountMutation],
  );

  const handleReconciliationChange = React.useCallback(
    (account: ChartAccountRow, allowReconciliation: boolean) => {
      if (
        !canManageAccounts ||
        account.allow_reconciliation === allowReconciliation
      ) {
        return;
      }
      patchAccountMutation.mutate({
        accountId: account.id,
        patch: { allow_reconciliation: allowReconciliation },
      });
    },
    [canManageAccounts, patchAccountMutation],
  );

  const pendingAccountId = patchAccountMutation.isPending
    ? (patchAccountMutation.variables?.accountId ?? null)
    : null;

  return (
    <div className="space-y-4 px-4 py-4 md:px-8">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
        </p>
      ) : null}

      <section className="flex h-[calc(100vh-7rem)] min-h-[560px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950">
        <COANavbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalCount={displayAccounts.length}
          canCreate={canManageAccounts}
          onCreate={() => router.push("/accounting/chart-of-accounts/new")}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <COASidebar
            groups={coaGroups}
            selectedGroupId={selectedGroupId}
            onGroupSelect={setSelectedGroupId}
          />

          <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            {loading ? (
              <div className="flex min-h-[360px] items-center justify-center text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : displayAccounts.length > 0 ? (
              viewMode === "grid" ? (
                <COAGridView
                  accounts={displayAccounts}
                  onAccountOpen={openAccount}
                />
              ) : (
                <COATableView
                  accounts={displayAccounts}
                  canManage={canManageAccounts}
                  pendingAccountId={pendingAccountId}
                  onAccountOpen={openAccount}
                  onActiveChange={handleActiveChange}
                  onReconciliationChange={handleReconciliationChange}
                />
              )
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                No accounts found
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
