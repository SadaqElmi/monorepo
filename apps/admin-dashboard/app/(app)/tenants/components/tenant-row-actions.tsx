"use client";

import {
  Activity,
  Archive,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tenantMissingOwner } from "@/lib/tenants/tenant-owner";
import { getTenantActionAvailability } from "@/lib/tenants/tenant-actions";
import type { Tenant } from "@/lib/services/tenants";
import type { TenantRowActions } from "./tenant-table";

type TenantRowActionsProps = {
  tenant: Tenant;
  actions: TenantRowActions;
  busy: boolean;
  compact?: boolean;
};

function TenantActionTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function TenantRowActionButtons({
  tenant,
  actions,
  busy,
  compact = false,
}: TenantRowActionsProps) {
  const { canActivate, canSuspend, canInactive } =
    getTenantActionAvailability(tenant);

  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-2"
          : "flex flex-wrap justify-end gap-1.5"
      }
    >
      <TenantActionTooltip label="View health and tenant details">
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          className={
            compact
              ? "h-8 flex-1 rounded-full px-2.5 text-[11px] sm:flex-none"
              : "h-8 rounded-full px-2.5 text-[11px]"
          }
          onClick={() => actions.onView(tenant)}
        >
          <Activity className="mr-1 h-3.5 w-3.5" />
          Details
        </Button>
      </TenantActionTooltip>
      {tenantMissingOwner(tenant) && (
        <TenantActionTooltip label={busy ? "Working…" : "Assign tenant owner"}>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            disabled={busy}
            onClick={() => actions.onAssignOwner(tenant)}
          >
            <UserPlus className="h-4 w-4" />
            <span className="sr-only">Assign owner</span>
          </Button>
        </TenantActionTooltip>
      )}
      <TenantActionTooltip
        label={
          busy
            ? "Working…"
            : canActivate
              ? "Activate tenant"
              : "Tenant is already active"
        }
      >
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          disabled={!canActivate || busy}
          onClick={() => actions.onAction(tenant, "activate")}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          <span className="sr-only">Activate</span>
        </Button>
      </TenantActionTooltip>
      <TenantActionTooltip
        label={
          busy
            ? "Working…"
            : canSuspend
              ? "Suspend tenant"
              : "Only active tenants can be suspended"
        }
      >
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          disabled={!canSuspend || busy}
          onClick={() => actions.onAction(tenant, "suspend")}
        >
          <PauseCircle className="h-4 w-4" />
          <span className="sr-only">Suspend</span>
        </Button>
      </TenantActionTooltip>
      <TenantActionTooltip
        label={
          busy
            ? "Working…"
            : canInactive
              ? "Mark tenant inactive"
              : "Tenant is already inactive"
        }
      >
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          disabled={!canInactive || busy}
          onClick={() => actions.onAction(tenant, "inactive")}
        >
          <Archive className="h-4 w-4" />
          <span className="sr-only">Mark inactive</span>
        </Button>
      </TenantActionTooltip>
      <TenantActionTooltip label={busy ? "Working…" : "Run database migration"}>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          disabled={busy}
          onClick={() => actions.onAction(tenant, "migration")}
        >
          <RefreshCcw className="h-4 w-4" />
          <span className="sr-only">Run migration</span>
        </Button>
      </TenantActionTooltip>
      <TenantActionTooltip label={busy ? "Working…" : "Create backup job"}>
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          className={
            compact
              ? "h-8 flex-1 rounded-full px-2.5 text-[11px] sm:flex-none"
              : "h-8 rounded-full px-2.5 text-[11px]"
          }
          disabled={busy}
          onClick={() => actions.onAction(tenant, "backup")}
        >
          Backup
        </Button>
      </TenantActionTooltip>
    </div>
  );
}
