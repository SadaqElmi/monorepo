"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tenant } from "@/lib/services/tenants";
import type { TenantOwnerRow } from "@/lib/tenants/tenant-owners";

export type TenantOwnerFormMode = "create" | "edit";

type TenantOwnerFormDialogProps = {
  open: boolean;
  mode: TenantOwnerFormMode;
  row: TenantOwnerRow | null;
  tenantOptions: Tenant[];
  tenantId: string;
  ownerName: string;
  ownerEmail: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onTenantChange: (tenantId: string) => void;
  onChange: (field: "ownerName" | "ownerEmail", value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

export function TenantOwnerFormDialog({
  open,
  mode,
  row,
  tenantOptions,
  tenantId,
  ownerName,
  ownerEmail,
  saving,
  onOpenChange,
  onTenantChange,
  onChange,
  onSubmit,
}: TenantOwnerFormDialogProps) {
  const isCreate = mode === "create";
  const selectedTenant =
    tenantOptions.find((tenant) => tenant.id === tenantId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isCreate ? "Assign tenant owner" : "Edit tenant owner"}
            </DialogTitle>
            <DialogDescription>
              {isCreate
                ? "Pick a client tenant and create the pharmacy admin account."
                : `Update owner details for ${row?.tenantName ?? "this tenant"}. A new temporary password may be issued if a new user is created.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isCreate ? (
              <div className="space-y-1.5">
                <Label htmlFor="tenant-owner-tenant">Client tenant</Label>
                <Select
                  value={tenantId || undefined}
                  onValueChange={onTenantChange}
                  disabled={saving}
                >
                  <SelectTrigger id="tenant-owner-tenant" className="w-full">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantOptions.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                        {tenant.slug ? ` (${tenant.slug})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{row?.tenantName}</p>
                <p className="text-xs text-muted-foreground">
                  {row?.tenantSlug ?? row?.tenantId}
                </p>
              </div>
            )}

            {selectedTenant && !selectedTenant.hasDatabaseUrl ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                This tenant has no dedicated database yet. Owner provisioning may
                fail until provisioning completes.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="tenant-owner-name">Owner name</Label>
              <Input
                id="tenant-owner-name"
                value={ownerName}
                onChange={(e) => onChange("ownerName", e.target.value)}
                required
                disabled={saving}
                placeholder="Jane Owner"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-owner-email">Owner email</Label>
              <Input
                id="tenant-owner-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => onChange("ownerEmail", e.target.value)}
                required
                disabled={saving}
                placeholder="owner@example.com"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (isCreate && !tenantId)}>
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {isCreate ? "Assign owner" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
