"use client";

import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { TenantRowActionButtons } from "./tenant-row-actions";
import type { TenantRowProps } from "./tenant-table";

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

function MobileField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-2">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-xs font-medium ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

export function TenantMobileCard({
  tenant,
  style,
  actions,
  busyTenantId,
}: TenantRowProps) {
  const busy = busyTenantId === tenant.id;

  return (
    <article
      style={style}
      className="border-b p-4 lg:hidden hover:bg-muted/20"
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => actions.onView(tenant)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{tenant.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {tenant.slug ?? tenant.schemaName}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={`shrink-0 gap-1.5 ${getTenantStatusBadgeClass(tenant.status)}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${getTenantStatusDotClass(tenant.status)}`}
            />
            {getTenantStatusLabel(tenant.status)}
          </Badge>
        </div>
      </button>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <MobileField label="Owner" value={tenant.ownerName ?? "No owner"} />
        <MobileField
          label="Owner email"
          value={tenant.ownerEmail ?? "Missing"}
        />
        <MobileField
          label="Database"
          value={getTenantDatabaseName(tenant)}
          mono
        />
        <MobileField
          label="Health"
          value={formatDatabaseHealthStatus(tenant.databaseHealthStatus)}
        />
        <MobileField label="Migration" value={tenant.migrationStatus} />
        <MobileField label="Storage" value={bytesLabel(tenant.storageUsed)} />
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-primary/5 px-2 py-0.5 font-medium text-primary">
          <Database className="h-3 w-3" />
          {tenant.hasDatabaseUrl ? "DB configured" : "DB not configured"}
        </span>
        <span>POS: {tenant.posTerminalCount}</span>
        <span className="truncate">
          Login: {formatTenantDate(tenant.lastLoginAt ?? undefined)}
        </span>
      </div>

      {tenant.errorMessage && (
        <p className="mt-2 line-clamp-2 text-[11px] text-destructive">
          {tenant.errorMessage}
        </p>
      )}

      <div className="mt-3 border-t pt-3">
        <TenantRowActionButtons
          tenant={tenant}
          actions={actions}
          busy={busy}
          compact
        />
      </div>
    </article>
  );
}
