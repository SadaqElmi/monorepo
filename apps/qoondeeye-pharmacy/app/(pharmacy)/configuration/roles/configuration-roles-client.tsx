"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Pencil,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Lock,
  Users,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_STATIC,
    initialData:
      serverPrefetched && initialRoles ? initialRoles : undefined,
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
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex flex-1 items-center gap-3">
            <div className="h-6 w-px bg-gradient-to-b from-cyan-500 to-transparent" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink
                    href="/dashboard"
                    className="text-slate-400 hover:text-slate-200"
                  >
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink
                    href="/configuration/staff"
                    className="text-slate-400 hover:text-slate-200"
                  >
                    Staff
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-cyan-400">
                    Roles
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-auto">
        <div className="flex flex-1 flex-col gap-8 px-6 py-8 md:px-8">
          {/* Hero Section */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 backdrop-blur-sm">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-medium text-cyan-300">
                Role &amp; Permission Management
              </span>
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Manage Roles
              </h1>
              <p className="mt-2 text-base text-slate-400">
                Define what your team members can do in the pharmacy: products,
                reports, and user management.
              </p>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            {/* Roles List Card */}
            <Card className="border-slate-800 bg-slate-900/50 shadow-2xl backdrop-blur">
              <CardContent className="p-6">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-cyan-400" />
                    <h2 className="text-lg font-semibold text-white">
                      Existing Roles
                    </h2>
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {roles.length}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="gap-1.5 border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200"
                  >
                    <Plus className="h-4 w-4" />
                    New Role
                  </Button>
                </div>

                <div className="space-y-3">
                  {!tenantSlug ? (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                      Missing tenant information. Please sign in again.
                    </div>
                  ) : loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
                    </div>
                  ) : roles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/20 py-12 text-center">
                      <Lock className="h-8 w-8 text-slate-500 mb-3" />
                      <p className="text-sm text-slate-400">
                        No roles created yet. Create your first role using the
                        form.
                      </p>
                    </div>
                  ) : (
                    roles.map((role) => (
                      <div
                        key={role.id}
                        className="group relative rounded-lg border border-slate-700 bg-gradient-to-r from-slate-800/40 to-slate-800/20 px-4 py-4 transition-all duration-200 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">
                                {role.name}
                              </span>
                              {editingRoleId === role.id && (
                                <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-300 border border-cyan-500/30">
                                  Editing
                                </span>
                              )}
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {(role.permissions ?? []).length === 0 ? (
                                <span className="text-xs text-slate-500">
                                  No permissions assigned
                                </span>
                              ) : (
                                (role.permissions ?? []).map((perm) => (
                                  <span
                                    key={perm}
                                    className="inline-block rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300 border border-cyan-500/20"
                                  >
                                    {perm}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 border-slate-600 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/30"
                              onClick={() => startEdit(role)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 border-slate-600 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                              onClick={() => handleDelete(role.id)}
                              disabled={deletingId === role.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Form Card */}
            <Card className="border-slate-800 bg-slate-900/50 shadow-2xl backdrop-blur lg:sticky lg:top-20 lg:h-fit">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {editingRoleId ? "Edit Role" : "Create New Role"}
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-400">
                    {editingRoleId
                      ? "Update the role details and permissions."
                      : "Give the role a clear name (e.g. Pharmacist, Cashier, Manager) and assign permissions."}
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 backdrop-blur">
                    <XCircle className="h-5 w-5 flex-shrink-0 text-red-400 mt-0.5" />
                    <span className="text-sm text-red-300">{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 backdrop-blur">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400 mt-0.5" />
                    <span className="text-sm text-emerald-300">{success}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Role Name Input */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="role-name"
                      className="text-sm font-medium text-white"
                    >
                      Role Name
                    </Label>
                    <Input
                      id="role-name"
                      placeholder="e.g. Manager, Pharmacist, Cashier"
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                      className="border-slate-700 bg-slate-800/50 text-white placeholder-slate-500 focus:border-cyan-500/50 focus:bg-slate-800"
                    />
                  </div>

                  {/* Permissions Grid */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-white">
                      Permissions
                    </Label>
                    <div className="grid gap-2 rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                      {ALL_PERMISSIONS.map((permission) => {
                        const checked = form.permissions.includes(permission);
                        return (
                          <label
                            key={permission}
                            className="group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-700/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                togglePermission(permission)
                              }
                              className="mt-1 border-slate-600 checked:bg-cyan-500 checked:border-cyan-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-200 capitalize">
                                {permission.replaceAll("_", " ")}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
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

                  <Separator className="bg-slate-700/50" />

                  {/* Form Actions */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    {editingRoleId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-800"
                        onClick={resetForm}
                      >
                        Cancel Editing
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">
                        You can always update these settings later.
                      </span>
                    )}

                    <Button
                      type="submit"
                      disabled={saving || !tenantSlug}
                      className="gap-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white shadow-lg shadow-cyan-500/20"
                    >
                      {saving
                        ? editingRoleId
                          ? "Saving…"
                          : "Creating…"
                        : editingRoleId
                          ? "Save Changes"
                          : "Create Role"}
                    </Button>
                  </div>
                </form>

                {!tenantSlug && (
                  <div className="text-xs text-red-400">
                    Tenant information is missing. Please sign in again.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
