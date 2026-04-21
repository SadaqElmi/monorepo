"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Pencil,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
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
import { getStoredUser } from "@/lib/auth-client";
import {
  createRole,
  deleteRole,
  getRoles,
  type Role,
  updateRole,
} from "@/lib/api";

const ALL_PERMISSIONS = [
  "create_product",
  "edit_product",
  "delete_product",
  "view_reports",
  "manage_users",
] as const;

type PermissionName = (typeof ALL_PERMISSIONS)[number];

type RoleFormState = {
  id?: string;
  name: string;
  permissions: PermissionName[];
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      setError("Missing tenant information. Please sign in again.");
      return;
    }

    async function loadRoles() {
      setLoading(true);
      setError(null);
      try {
        const data = await getRoles(tenantSlug);
        setRoles(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load roles.");
      } finally {
        setLoading(false);
      }
    }

    void loadRoles();
  }, [tenantSlug]);

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
        updated = await updateRole(tenantSlug, editingRoleId, payload);
        setRoles((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
        setSuccess("Role updated successfully.");
      } else {
        updated = await createRole(tenantSlug, payload);
        setRoles((prev) => [updated, ...prev]);
        setSuccess("Role created successfully.");
      }

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
      setRoles((prev) => prev.filter((r) => r.id !== id));
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
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex flex-1 items-center gap-2">
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/configuration/staff">Staff</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Roles</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-6 bg-muted/30 p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Shield className="h-3.5 w-3.5" />
                <span>Role &amp; permission management</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                Roles
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Define what your team members can do in the pharmacy: products,
                reports, and user management.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">Existing roles</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New role
                  </Button>
                </div>

                {loading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading roles…
                  </p>
                ) : roles.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                    No roles have been created yet. Use the form on the right to
                    create your first role.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {roles.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-start justify-between gap-3 rounded-lg border bg-background px-4 py-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {role.name}
                            </span>
                            {editingRoleId === role.id && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                Editing
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {(role.permissions ?? []).length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                No permissions assigned
                              </span>
                            ) : (
                              (role.permissions ?? []).map((perm) => (
                                <span
                                  key={perm}
                                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                >
                                  {perm}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => startEdit(role)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(role.id)}
                            disabled={deletingId === role.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="space-y-5 p-6">
                <div>
                  <h2 className="text-base font-semibold">
                    {editingRoleId ? "Edit role" : "Create new role"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Give the role a clear name (for example
                    {" "}
                    &quot;Pharmacist&quot;, &quot;Cashier&quot;, or
                    {" "}
                    &quot;Manager&quot;) and select what it can do.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{success}</span>
                  </div>
                )}

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
                    <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-xs sm:grid-cols-2">
                      {ALL_PERMISSIONS.map((permission) => {
                        const checked = form.permissions.includes(permission);
                        return (
                          <label
                            key={permission}
                            className="group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-background"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                togglePermission(permission)
                              }
                              className="mt-0.5"
                            />
                            <div>
                              <div className="font-medium capitalize">
                                {permission.replaceAll("_", " ")}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
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

                  <div className="flex items-center justify-between gap-3 pt-1">
                    {editingRoleId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={resetForm}
                      >
                        Cancel editing
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        You can always update these settings later.
                      </span>
                    )}

                    <Button type="submit" disabled={saving || !tenantSlug}>
                      {saving
                        ? editingRoleId
                          ? "Saving changes…"
                          : "Creating role…"
                        : editingRoleId
                          ? "Save changes"
                          : "Create role"}
                    </Button>
                  </div>
                </form>

                {!tenantSlug && (
                  <p className="text-xs text-destructive">
                    Tenant information is missing. Please sign in again to
                    manage roles.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
  );
}
