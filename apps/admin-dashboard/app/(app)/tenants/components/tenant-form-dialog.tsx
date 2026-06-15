"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTenantDate } from "@/lib/tenants/format-date";
import { getTenantDatabaseName } from "@/lib/tenants/database-name";
import {
  type EditableTenant,
  type TenantFormMode,
} from "@/lib/tenants/tenant-form";
import type { Tenant } from "@/lib/services/tenants";
import { getProvisioningStatusLabel } from "@/lib/tenant-status";

type TenantFormDialogProps = {
  open: boolean;
  mode: TenantFormMode;
  form: EditableTenant;
  viewTenant: Tenant | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (field: keyof EditableTenant, value: string) => void;
};

export function TenantFormDialog({
  open,
  mode,
  form,
  viewTenant,
  saving,
  onClose,
  onSubmit,
  onChange,
}: TenantFormDialogProps) {
  if (!open) return null;

  const nameEditDisabled =
    mode === "edit" &&
    viewTenant != null &&
    viewTenant.status === "pending_setup";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card shadow-xl">
        <form onSubmit={onSubmit}>
          <div className="border-b px-5 py-3">
            <h2 className="text-base font-semibold">
              {mode === "create" ? "Create client" : "Edit client"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "create"
                ? "Provision a dedicated PostgreSQL database and owner admin account."
                : "View tenant control-plane details."}
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1">
              <Label htmlFor="tenant-name">Name</Label>
              <Input
                id="tenant-name"
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                required
                disabled={nameEditDisabled}
                placeholder="City Clinic"
              />
            </div>

            {mode === "create" && (
              <>
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  Creates a dedicated PostgreSQL database named{" "}
                  <code className="font-mono">tenant_&lt;slug&gt;_db</code> with
                  default roles, Main Branch, and retail price group.
                </p>

                <div className="space-y-1">
                  <Label htmlFor="tenant-owner-name">Owner name</Label>
                  <Input
                    id="tenant-owner-name"
                    value={form.ownerName}
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
                    value={form.ownerEmail}
                    onChange={(e) => onChange("ownerEmail", e.target.value)}
                    required
                    placeholder="owner@example.com"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tenant-slug">Slug</Label>
                  <Input
                    id="tenant-slug"
                    value={form.slug}
                    onChange={(e) => onChange("slug", e.target.value)}
                    placeholder="hayat_pharmacy"
                    pattern="[a-z0-9_]*"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Lowercase letters, numbers, and underscores only.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tenant-subdomain">Subdomain</Label>
                  <Input
                    id="tenant-subdomain"
                    value={form.subdomain}
                    onChange={(e) => onChange("subdomain", e.target.value)}
                    placeholder="hayat"
                    pattern="[a-z0-9_]*"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tenant-schema">Tenant ID (schema name)</Label>
                  <Input
                    id="tenant-schema"
                    value={form.schemaName}
                    onChange={(e) => onChange("schemaName", e.target.value)}
                    placeholder="city_clinic"
                    pattern="[a-z0-9_]*"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Logical tenant key for API routing and X-Tenant. Leave blank
                    to auto-generate from name or domain.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tenant-domain">Primary domain</Label>
                  <Input
                    id="tenant-domain"
                    value={form.primaryDomain ?? ""}
                    onChange={(e) => onChange("primaryDomain", e.target.value)}
                    placeholder="city.yourapp.com"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tenant-extra-domains">
                    Extra domains (comma separated)
                  </Label>
                  <Input
                    id="tenant-extra-domains"
                    value={form.extraDomains ?? ""}
                    onChange={(e) => onChange("extraDomains", e.target.value)}
                    placeholder="cityclinic.com, pharmacy.cityclinic.com"
                  />
                </div>
              </>
            )}

            {mode === "edit" && viewTenant && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="font-medium">Database</p>
                  <p className="mt-1 text-muted-foreground">
                    {viewTenant.hasDatabaseUrl
                      ? "Encrypted URL configured"
                      : "Database URL not configured"}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Database: {getTenantDatabaseName(viewTenant)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Tenant ID: {viewTenant.schemaName}
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    Database health: {viewTenant.databaseHealthStatus}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Migration: {viewTenant.migrationStatus}
                  </p>
                  {viewTenant.provisioningStatus && (
                    <p className="mt-2 text-muted-foreground">
                      Provisioning:{" "}
                      {getProvisioningStatusLabel(viewTenant.provisioningStatus)}
                    </p>
                  )}
                  {viewTenant.errorMessage && (
                    <p className="mt-2 text-destructive">
                      {viewTenant.errorMessage}
                    </p>
                  )}
                  {viewTenant.lastBackupAt && (
                    <p className="mt-1 text-muted-foreground">
                      Last backup request:{" "}
                      {formatTenantDate(viewTenant.lastBackupAt)}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {mode === "create" ? "Create client" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
