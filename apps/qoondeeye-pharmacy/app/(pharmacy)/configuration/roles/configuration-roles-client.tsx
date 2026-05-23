"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Shield, Pencil, Trash2, Plus, Loader2, Lock } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import {
  createRole,
  deleteRole,
  getRoles,
  type Role,
  updateRole,
} from "@/lib/api";
import { ALL_PERMISSIONS, type PermissionName } from "@/lib/permissions";

type RoleFormState = {
  id?: string;
  name: string;
  permissions: PermissionName[];
};

export type ConfigurationRolesPageClientProps = {
  initialRoles?: Role[] | null;
  serverPrefetched?: boolean;
};

export default function RolesPage({
  initialRoles = null,
  serverPrefetched = false,
}: ConfigurationRolesPageClientProps = {}) {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [form, setForm] = useState<RoleFormState>({
    name: "",
    permissions: [],
  });

  const tenantSlug = useMemo(() => getStoredUser()?.tenantSlug ?? "", []);

  const rolesQuery = useQuery({
    queryKey: erpKeys.roles(tenantSlug, branchFacet),
    queryFn: () => getRoles(tenantSlug),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    initialData: serverPrefetched && initialRoles ? initialRoles : undefined,
  });
  const roles = rolesQuery.data ?? [];
  const loading = rolesQuery.isPending;
  const loadError = rolesQuery.error;
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load roles."
        : null);

  function resetForm() {
    setEditingRoleId(null);
    setForm({ name: "", permissions: [] });
  }

  function startEdit(role: Role) {
    setEditingRoleId(role.id);
    setForm({
      id: role.id,
      name: role.name,
      permissions: (role.permissions ?? []).filter((p): p is PermissionName =>
        ALL_PERMISSIONS.includes(p as PermissionName),
      ),
    });
  }

  function togglePermission(permission: PermissionName) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantSlug) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: form.name.trim(),
        permissions: form.permissions,
      };

      let updated: Role;

      if (editingRoleId) {
        await updateRole(tenantSlug, editingRoleId, payload);
        setSuccess("Role updated successfully.");
      } else {
        await createRole(tenantSlug, payload);
        setSuccess("Role created successfully.");
      }

      await queryClient.invalidateQueries({ queryKey: ["erp", "roles"] });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!tenantSlug) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this role? This action cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingId(id);
    setError(null);
    setSuccess(null);

    try {
      await deleteRole(tenantSlug, id);
      await queryClient.invalidateQueries({ queryKey: ["erp", "roles"] });
      if (editingRoleId === id) {
        resetForm();
      }
      setSuccess("Role deleted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex flex-1 flex-col gap-4 overflow-auto p-6 md:p-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Roles</h1>
              <p className="text-sm text-muted-foreground">
                Define what your team can do: products, reports, and user
                management.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              {roles.length} role{roles.length === 1 ? "" : "s"}
            </div>
          </div>

          {displayError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {displayError}
            </div>
          )}

          {success && (
            <div className="rounded-xl border px-4 py-3 text-sm text-foreground">
              {success}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card className="overflow-hidden border-0 shadow-md">
              <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Existing roles</CardTitle>
                    <CardDescription>
                      Roles assigned to staff control access across the
                      pharmacy.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-3">
                  {!tenantSlug ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      Missing tenant information. Please sign in again.
                    </div>
                  ) : loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading roles…
                    </div>
                  ) : roles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Lock className="h-7 w-7" />
                      </div>
                      <p className="text-sm font-medium">No roles yet</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        Create your first role using the form on the right.
                      </p>
                    </div>
                  ) : (
                    roles.map((role) => (
                      <div
                        key={role.id}
                        className="group flex items-start justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{role.name}</span>
                            {editingRoleId === role.id && (
                              <Badge variant="secondary">Editing</Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(role.permissions ?? []).length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                No permissions assigned
                              </span>
                            ) : (
                              (role.permissions ?? []).map((perm) => (
                                <Badge key={perm} variant="outline">
                                  {perm.replaceAll("_", " ")}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => startEdit(role)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(role.id)}
                            disabled={deletingId === role.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-md lg:sticky lg:top-20 lg:h-fit">
              <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
                <CardTitle className="text-base">
                  {editingRoleId ? "Edit role" : "Create role"}
                </CardTitle>
                <CardDescription>
                  {editingRoleId
                    ? "Update the role name and permissions."
                    : "Name the role (e.g. Pharmacist, Cashier) and assign permissions."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 p-4 sm:p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="role-name">Role name</Label>
                    <Input
                      id="role-name"
                      placeholder="e.g. Manager, Pharmacist, Cashier"
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Permissions</Label>
                    <div className="grid gap-1 rounded-lg border p-3">
                      {ALL_PERMISSIONS.map((permission) => {
                        const checked = form.permissions.includes(permission);
                        return (
                          <label
                            key={permission}
                            className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                togglePermission(permission)
                              }
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium capitalize">
                                {permission.replaceAll("_", " ")}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                                {permission === "create_product" &&
                                  "Can create new products in the catalog."}
                                {permission === "edit_product" &&
                                  "Can edit existing products and their details."}
                                {permission === "delete_product" &&
                                  "Can remove products from the catalog."}
                                {permission === "view_reports" &&
                                  "Can access sales and inventory reports."}
                                {permission === "manage_users" &&
                                  "Can invite, edit, and deactivate staff users."}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3">
                    {editingRoleId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetForm}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        You can update these later.
                      </span>
                    )}

                    <Button
                      type="submit"
                      disabled={saving || !tenantSlug}
                      className="gap-2"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {saving
                        ? editingRoleId
                          ? "Saving…"
                          : "Creating…"
                        : editingRoleId
                          ? "Save changes"
                          : "Create role"}
                    </Button>
                  </div>
                </form>

                {!tenantSlug && (
                  <p className="text-xs text-destructive">
                    Tenant information is missing. Please sign in again.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
