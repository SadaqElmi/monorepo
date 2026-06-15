"use client";

import { memo, useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TENANT_LIST_MAX_HEIGHT,
  TENANT_ROW_HEIGHT,
} from "@/lib/tenants/constants";
import {
  formatDatabaseHealthStatus,
  getTenantDatabaseName,
} from "@/lib/tenants/database-name";
import { formatTenantDate } from "@/lib/tenants/format-date";
import type { Tenant } from "@/lib/services/tenants";
import {
  getTenantStatusBadgeClass,
  getTenantStatusDotClass,
  getTenantStatusLabel,
} from "@/lib/tenant-status";
import { TenantMobileCard } from "./tenant-mobile-card";
import { TenantRowActionButtons } from "./tenant-row-actions";

export const TENANT_TABLE_GRID =
  "grid grid-cols-[minmax(160px,1.2fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(120px,0.8fr)_minmax(170px,1fr)_minmax(220px,1.2fr)] gap-3 px-4";

export type TenantAction =
  | "activate"
  | "suspend"
  | "inactive"
  | "migration"
  | "backup";

export type TenantRowActions = {
  onView: (tenant: Tenant) => void;
  onAssignOwner: (tenant: Tenant) => void;
  onAction: (tenant: Tenant, action: TenantAction) => void;
};

type TenantRowSharedProps = {
  actions: TenantRowActions;
  busyTenantId: string | null;
};

export type TenantRowProps = TenantRowSharedProps & {
  tenant: Tenant;
  style?: React.CSSProperties;
};

function bytesLabel(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function TenantDesktopRow({
  tenant,
  style,
  actions,
  busyTenantId,
}: TenantRowProps) {
  const busy = busyTenantId === tenant.id;

  return (
    <div
      style={style}
      className={`${TENANT_TABLE_GRID} hidden min-w-[1080px] items-start border-b py-3 text-sm hover:bg-muted/30 lg:grid`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-col text-left"
        onClick={() => actions.onView(tenant)}
      >
        <span className="truncate font-medium">{tenant.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          ID: {tenant.id}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {tenant.slug ?? tenant.schemaName}
        </span>
      </button>

      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {tenant.ownerName ?? "No owner"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {tenant.ownerEmail ?? "Owner email missing"}
        </span>
      </div>

      <div className="min-w-0 space-y-1">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border/60 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Database className="h-3 w-3" />
          {tenant.hasDatabaseUrl ? "Configured" : "Not configured"}
        </span>
        <div className="truncate font-mono text-xs text-muted-foreground">
          DB: {getTenantDatabaseName(tenant)}
        </div>
        <div className="text-xs text-muted-foreground">
          Health: {formatDatabaseHealthStatus(tenant.databaseHealthStatus)}
        </div>
        <div className="text-xs text-muted-foreground">
          Migration: {tenant.migrationStatus}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Badge
          variant="secondary"
          className={`w-fit gap-1.5 ${getTenantStatusBadgeClass(tenant.status)}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${getTenantStatusDotClass(tenant.status)}`}
          />
          {getTenantStatusLabel(tenant.status)}
        </Badge>
        {tenant.provisioningStatus && (
          <span className="text-[10px] text-muted-foreground">
            Provisioning: {tenant.provisioningStatus}
          </span>
        )}
        {tenant.errorMessage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[180px] truncate text-[10px] text-destructive">
                {tenant.errorMessage}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tenant.errorMessage}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Last login: {formatTenantDate(tenant.lastLoginAt ?? undefined)}</div>
        <div>Storage: {bytesLabel(tenant.storageUsed)}</div>
        <div>POS terminals: {tenant.posTerminalCount}</div>
        <div>Last backup: {formatTenantDate(tenant.lastBackupAt ?? undefined)}</div>
      </div>

      <TenantRowActionButtons tenant={tenant} actions={actions} busy={busy} />
    </div>
  );
}

function TenantRowComponent(props: TenantRowProps) {
  return (
    <>
      <TenantMobileCard {...props} />
      <TenantDesktopRow {...props} />
    </>
  );
}

export const TenantRow = memo(TenantRowComponent);

type VirtualRowData = TenantRowSharedProps & {
  tenants: Tenant[];
};

function VirtualRow({
  index,
  style,
  tenants,
  actions,
  busyTenantId,
}: RowComponentProps<VirtualRowData>) {
  const tenant = tenants[index];
  if (!tenant) return null;
  return (
    <TenantDesktopRow
      tenant={tenant}
      style={style}
      actions={actions}
      busyTenantId={busyTenantId}
    />
  );
}

export type VirtualizedTenantListProps = TenantRowSharedProps & {
  tenants: Tenant[];
};

export function VirtualizedTenantList({
  tenants,
  actions,
  busyTenantId,
}: VirtualizedTenantListProps) {
  const listHeight = Math.min(
    tenants.length * TENANT_ROW_HEIGHT,
    TENANT_LIST_MAX_HEIGHT,
  );

  const rowProps = useMemo<VirtualRowData>(
    () => ({
      tenants,
      actions,
      busyTenantId,
    }),
    [tenants, actions, busyTenantId],
  );

  return (
    <div className="hidden overflow-x-auto lg:block">
      <List
        rowCount={tenants.length}
        rowHeight={TENANT_ROW_HEIGHT}
        rowComponent={VirtualRow}
        rowProps={rowProps}
        defaultHeight={listHeight}
        overscanCount={6}
        style={{ height: listHeight, width: "100%", minWidth: 1080 }}
      />
    </div>
  );
}

export type PaginatedTenantTableProps = VirtualizedTenantListProps & {
  page: number;
  pageSize: number;
};

export function PaginatedTenantTable({
  tenants,
  page,
  pageSize,
  ...rowProps
}: PaginatedTenantTableProps) {
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return tenants.slice(start, start + pageSize);
  }, [tenants, page, pageSize]);

  return (
    <div>
      <div className="lg:hidden">
        {pageItems.map((tenant) => (
          <TenantMobileCard key={tenant.id} tenant={tenant} {...rowProps} />
        ))}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        {pageItems.map((tenant) => (
          <TenantDesktopRow key={tenant.id} tenant={tenant} {...rowProps} />
        ))}
      </div>
    </div>
  );
}

export function TenantTableHeader() {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <div
        className={`${TENANT_TABLE_GRID} min-w-[1080px] border-b bg-muted/40 py-2 text-xs font-medium text-muted-foreground`}
      >
        <span>Name</span>
        <span>Owner</span>
        <span>Database</span>
        <span>Status</span>
        <span>Summaries</span>
        <span className="text-right">Actions</span>
      </div>
    </div>
  );
}
