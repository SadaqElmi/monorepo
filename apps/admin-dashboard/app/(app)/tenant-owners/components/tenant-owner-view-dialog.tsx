"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTenantDate } from "@/lib/tenants/format-date";
import {
  getTenantStatusBadgeClass,
  getTenantStatusLabel,
} from "@/lib/tenant-status";
import type { TenantOwnerRow } from "@/lib/tenants/tenant-owners";

type TenantOwnerViewDialogProps = {
  open: boolean;
  row: TenantOwnerRow | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
};

export function TenantOwnerViewDialog({
  open,
  row,
  onOpenChange,
  onEdit,
}: TenantOwnerViewDialogProps) {
  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Owner details</DialogTitle>
          <DialogDescription>
            Read-only view of the tenant owner assignment.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Owner name</dt>
            <dd className="font-medium">{row.ownerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Owner email</dt>
            <dd>{row.ownerEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tenant</dt>
            <dd className="font-medium">{row.tenantName}</dd>
            <dd className="text-xs text-muted-foreground">
              {row.tenantSlug ?? row.tenantId}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTenantStatusBadgeClass(row.tenantStatus)}`}
              >
                {getTenantStatusLabel(row.tenantStatus)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last login</dt>
            <dd>{formatTenantDate(row.lastLoginAt ?? undefined)}</dd>
          </div>
        </dl>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {row.hasOwner ? (
            <Button type="button" onClick={onEdit}>
              Edit owner
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
