"use client";

import * as React from "react";
import { Building2, Loader2 } from "lucide-react";

import { getResolvedStoredUser } from "@/lib/auth-client";
import {
  getAssignedBranchIdFromUser,
  isRestrictedToAssignedBranch,
} from "@/lib/branch-access";
import { syncActiveBranchCookie } from "@/lib/branch-cookie";
import { useErpBranches } from "@/hooks/queries/use-erp-branches";
import type { Branch } from "@/lib/services/branches";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function readBranchId(): string {
  const user = getResolvedStoredUser();
  const assignedBranchId = getAssignedBranchIdFromUser();
  if (assignedBranchId && isRestrictedToAssignedBranch(user?.role)) {
    return assignedBranchId;
  }
  try {
    const v = localStorage.getItem("branchId")?.trim();
    return v && v.length ? v : "all";
  } catch {
    return "all";
  }
}

type TeamSwitcherProps = {
  /** Compact trigger for the top app bar (no full-width stretch). */
  variant?: "default" | "header";
};

export function TeamSwitcher({ variant = "default" }: TeamSwitcherProps) {
  const resolvedUser = getResolvedStoredUser();
  const tenantSlug = resolvedUser?.tenantSlug ?? "pharmacy1";
  const restrictedToAssignedBranch = isRestrictedToAssignedBranch(
    resolvedUser?.role,
  );
  const assignedBranchId = getAssignedBranchIdFromUser();
  const branchesQuery = useErpBranches(tenantSlug);
  const branches: Branch[] = branchesQuery.data ?? [];
  const loading = branchesQuery.isPending;
  const [activeId, setActiveId] = React.useState<string>("all");

  React.useEffect(() => {
    setActiveId(readBranchId());
  }, [assignedBranchId, restrictedToAssignedBranch]);

  React.useEffect(() => {
    const onBranch = () => setActiveId(readBranchId());
    window.addEventListener("activeBranchChanged", onBranch);
    return () => window.removeEventListener("activeBranchChanged", onBranch);
  }, []);

  const emitBranch = React.useCallback(
    (branchId: string) => {
      if (
        restrictedToAssignedBranch &&
        assignedBranchId &&
        branchId !== assignedBranchId
      ) {
        return;
      }
      try {
        if (branchId === "all") {
          localStorage.setItem("branchId", "all");
          localStorage.setItem("branchName", "All branches");
        } else {
          localStorage.setItem("branchId", branchId);
          const selectedBranchName = branches
            .find((b) => b.id === branchId)
            ?.name?.trim();
          if (selectedBranchName) {
            localStorage.setItem("branchName", selectedBranchName);
          } else {
            localStorage.removeItem("branchName");
          }
        }
      } catch {
        // ignore
      }
      syncActiveBranchCookie(branchId);
      setActiveId(branchId);
      const selectedBranchName =
        branchId === "all"
          ? "All branches"
          : branches.find((b) => b.id === branchId)?.name?.trim();
      window.dispatchEvent(
        new CustomEvent("activeBranchChanged", {
          detail: {
            branchId: branchId === "all" ? null : branchId,
            branchName: selectedBranchName,
          },
        }),
      );
    },
    [assignedBranchId, branches, restrictedToAssignedBranch],
  );

  React.useEffect(() => {
    if (restrictedToAssignedBranch && assignedBranchId) {
      emitBranch(assignedBranchId);
    }
  }, [assignedBranchId, emitBranch, restrictedToAssignedBranch]);

  const canSelectAll = !restrictedToAssignedBranch;
  const label =
    activeId === "all" && canSelectAll
      ? "All branches"
      : branches.find((b) => b.id === activeId)?.name?.trim() ||
        `Branch ${activeId.slice(0, 8)}…`;

  const triggerClass =
    variant === "header"
      ? "h-9 max-w-[12rem] shrink justify-start gap-2 px-2.5 sm:max-w-[14rem]"
      : "h-9 w-full justify-start gap-2 px-2";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={triggerClass} type="button">
          {loading ? (
            <Loader2
              className="size-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : (
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate text-left text-sm font-medium">
            {loading ? "Loading branches…" : label}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56"
        align={variant === "header" ? "end" : "start"}
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Active branch
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canSelectAll ? (
          <DropdownMenuItem onClick={() => emitBranch("all")}>
            All branches
          </DropdownMenuItem>
        ) : null}
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => emitBranch(b.id)}
            disabled={
              restrictedToAssignedBranch &&
              Boolean(assignedBranchId) &&
              b.id !== assignedBranchId
            }
          >
            {b.name?.trim() || b.id}
          </DropdownMenuItem>
        ))}
        {!loading && branches.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No branches returned for this tenant.
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
