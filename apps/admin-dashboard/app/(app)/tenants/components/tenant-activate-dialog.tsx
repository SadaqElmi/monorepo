"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tenant } from "@/lib/services/tenants";

type TenantOwnerDialogProps = {
  open: boolean;
  tenant: Tenant | null;
  ownerName: string;
  ownerEmail: string;
  saving: boolean;
  purpose: "activate" | "assign";
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (field: "ownerName" | "ownerEmail", value: string) => void;
};

export function TenantOwnerDialog({
  open,
  tenant,
  ownerName,
  ownerEmail,
  saving,
  purpose,
  onClose,
  onSubmit,
  onChange,
}: TenantOwnerDialogProps) {
  if (!open || !tenant) return null;

  const isActivate = purpose === "activate";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-2xl border bg-card shadow-xl">
        <form onSubmit={onSubmit}>
          <div className="border-b px-5 py-3">
            <h2 className="text-base font-semibold">
              {isActivate ? `Activate ${tenant.name}` : `Assign owner for ${tenant.name}`}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isActivate
                ? "This tenant has no owner account configured. Enter owner details to create the admin user and activate the tenant."
                : "Create the tenant admin user in the dedicated database and save owner details on the control plane."}
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1">
              <Label htmlFor="tenant-owner-name">Owner name</Label>
              <Input
                id="tenant-owner-name"
                value={ownerName}
                onChange={(e) => onChange("ownerName", e.target.value)}
                required
                placeholder="Jane Owner"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tenant-owner-email">Owner email</Label>
              <Input
                id="tenant-owner-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => onChange("ownerEmail", e.target.value)}
                required
                placeholder="owner@example.com"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="w-full sm:w-auto" disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isActivate ? "Activate tenant" : "Assign owner"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** @deprecated Use TenantOwnerDialog */
export const TenantActivateDialog = TenantOwnerDialog;
