"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Shield,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  Lock,
  Copy,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { UsersModuleShell } from "@/components/users/users-module-shell";
import {
  ConfigurationErrorBanner,
  ConfigurationSuccessBanner,
} from "@/components/configuration/configuration-status-banner";
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
import { cn } from "@/lib/utils";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import {
  cloneRole,
  createRole,
  deleteRole,
  getRoles,
  type Role,
  updateRole,
} from "@/lib/api";
import {
  ALL_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_FULL_LABEL,
  PERMISSION_GROUP_LABELS,
  PERMISSION_GROUPS,
  type PermissionGroupId,
  type PermissionName,
} from "@/lib/permissions";

type RoleFormState = {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  isSystemRole?: boolean;
  permissions: PermissionName[];
};

const GROUP_ORDER: PermissionGroupId[] = [
  "inventory",
  "purchasing",
  "sales",
  "pricing",
  "customer_credit",
  "accounting",
  "imports",
  "administration",
  "audit",
  "consolidation",
];

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
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<PermissionGroupId>>(
    () => new Set(GROUP_ORDER),
  );
  const [form, setForm] = useState<RoleFormState>({
    name: "",
    description: "",
    active: true,
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

  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return roles.filter((role) => {
      if (!showInactive && role.active === false) return false;
      if (!q) return true;
      const haystack = `${role.name} ${role.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [roles, searchQuery, showInactive]);

  function resetForm() {
    setEditingRoleId(null);
    setForm({
      name: "",
      description: "",
      active: true,
      permissions: [],
    });
  }

  function startEdit(role: Role) {
    setEditingRoleId(role.id);
    setForm({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      active: role.active !== false,
      isSystemRole: role.isSystemRole,
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

  function toggleGroup(groupId: PermissionGroupId, checked: boolean) {
    const groupPerms = PERMISSION_GROUPS[groupId];
    setForm((prev) => {
      const set = new Set(prev.permissions);
      for (const p of groupPerms) {
        if (checked) set.add(p);
        else set.delete(p);
      }
      return { ...prev, permissions: Array.from(set) };
    });
  }

  function isGroupFullySelected(groupId: PermissionGroupId) {
    const groupPerms = PERMISSION_GROUPS[groupId];
    return groupPerms.every((p) => form.permissions.includes(p));
  }

  async function invalidateRoles() {
    await queryClient.invalidateQueries({ queryKey: ["erp", "roles"] });
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
        description: form.description.trim() || null,
        active: form.active,
        permissions: form.permissions,
      };

      if (editingRoleId) {
        const patch = form.isSystemRole
          ? { description: payload.description, active: payload.active, permissions: payload.permissions }
          : payload;
        await updateRole(tenantSlug, editingRoleId, patch);
        setSuccess("Role updated successfully.");
      } else {
        await createRole(tenantSlug, payload);
        setSuccess("Role created successfully.");
      }

      await invalidateRoles();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClone(role: Role) {
    if (!tenantSlug) return;
    const name = window.prompt(
      "Name for the cloned role",
      `${role.name} copy`,
    );
    if (!name?.trim()) return;

    setCloningId(role.id);
    setError(null);
    setSuccess(null);
    try {
      await cloneRole(tenantSlug, role.id, {
        name: name.trim(),
        description: role.description ?? null,
      });
      await invalidateRoles();
      setSuccess(`Cloned role as "${name.trim()}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone role.");
    } finally {
      setCloningId(null);
    }
  }

  async function handleDeactivate(role: Role) {
    if (!tenantSlug || role.isSystemRole) return;
    setSaving(true);
    setError(null);
    try {
      await updateRole(tenantSlug, role.id, { active: role.active === false });
      await invalidateRoles();
      setSuccess(
        role.active === false ? "Role reactivated." : "Role deactivated.",
      );
      if (editingRoleId === role.id) {
        setForm((prev) => ({ ...prev, active: role.active === false }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!tenantSlug) return;
    const role = roles.find((r) => r.id === id);
    if (role?.isSystemRole) {
      setError("System roles cannot be deleted.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to delete this role? This action cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingId(id);
    setError(null);
    setSuccess(null);

    try {
      await deleteRole(tenantSlug, id);
      await invalidateRoles();
      if (editingRoleId === id) resetForm();
      setSuccess("Role deleted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <UsersModuleShell
      title="Roles & permissions"
      description="Define what each role can access across inventory, sales, accounting, and administration. Clone system roles to customize without starting from scratch."
      stat={{
        icon: Shield,
        value: `${roles.length} role${roles.length === 1 ? "" : "s"}`,
      }}
      headerEnd={
        <Button
          size="sm"
          className="gap-1.5 rounded-full shadow-sm"
          onClick={resetForm}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New role</span>
          <span className="sm:hidden">New</span>
        </Button>
      }
    >
      {displayError ? <ConfigurationErrorBanner message={displayError} /> : null}
      {success ? <ConfigurationSuccessBanner message={success} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border shadow-sm">
          <CardHeader className="space-y-4 border-b bg-muted/20 px-4 py-5 sm:px-6">
            <div>
              <CardTitle className="text-lg">Role library</CardTitle>
              <CardDescription className="mt-1">
                Select a role to edit, or clone a system role as a starting
                template.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search roles…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-background pl-9"
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={showInactive}
                  onCheckedChange={(v) => setShowInactive(Boolean(v))}
                />
                Show inactive
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-2">
              {!tenantSlug ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  Missing tenant information. Please sign in again.
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading roles…
                </div>
              ) : filteredRoles.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Lock className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No matching roles</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Create a role using the form or adjust your search.
                  </p>
                </div>
              ) : (
                filteredRoles.map((role) => {
                  const isEditing = editingRoleId === role.id;
                  const permissionCount = (role.permissions ?? []).length;

                  return (
                    <div
                      key={role.id}
                      className={cn(
                        "group flex items-start justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors",
                        isEditing
                          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{role.name}</span>
                          {role.isSystemRole ? (
                            <Badge variant="secondary" className="text-[10px]">
                              System
                            </Badge>
                          ) : null}
                          {role.active === false ? (
                            <Badge variant="outline" className="text-[10px]">
                              Inactive
                            </Badge>
                          ) : null}
                          {typeof role.userCount === "number" ? (
                            <Badge variant="outline" className="text-[10px]">
                              {role.userCount} user
                              {role.userCount === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                          {isEditing ? (
                            <Badge className="text-[10px]">Editing</Badge>
                          ) : null}
                        </div>
                        {role.description ? (
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {role.description}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {permissionCount} permission
                          {permissionCount === 1 ? "" : "s"} granted
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Clone role"
                          onClick={() => handleClone(role)}
                          disabled={cloningId === role.id}
                        >
                          {cloningId === role.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant={isEditing ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEdit(role)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!role.isSystemRole ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => handleDeactivate(role)}
                            >
                              {role.active === false ? "Activate" : "Deactivate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDelete(role.id)}
                              disabled={deletingId === role.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border shadow-sm lg:sticky lg:top-[8.5rem] lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
          <CardHeader className="border-b bg-muted/20 px-4 py-5 sm:px-6">
            <CardTitle className="text-lg">
              {editingRoleId ? "Edit role" : "Create role"}
            </CardTitle>
            <CardDescription className="mt-1">
              {form.isSystemRole
                ? "System role: name is locked; you can edit description, active state, and permissions."
                : editingRoleId
                  ? "Update role metadata and permissions."
                  : "Name the role and assign permissions by module."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="role-name">Role name</Label>
                  <Input
                    id="role-name"
                    placeholder="e.g. Inventory clerk"
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                    disabled={Boolean(form.isSystemRole)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="role-description">Description</Label>
                  <Input
                    id="role-description"
                    placeholder="Optional summary for admins"
                    value={form.description}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="bg-background"
                  />
                </div>

                <label className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm sm:col-span-2">
                  <Checkbox
                    checked={form.active}
                    onCheckedChange={(v) =>
                      setForm((prev) => ({ ...prev, active: Boolean(v) }))
                    }
                  />
                  Active (assignable to staff)
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Permissions</Label>
                  <span className="text-xs font-medium text-muted-foreground">
                    {form.permissions.length} selected
                  </span>
                </div>
                <div className="space-y-2">
                  {GROUP_ORDER.map((groupId) => {
                    const expanded = expandedGroups.has(groupId);
                    const groupPerms = PERMISSION_GROUPS[groupId];
                    const selectedInGroup = groupPerms.filter((p) =>
                      form.permissions.includes(p),
                    ).length;

                    return (
                      <div
                        key={groupId}
                        className="overflow-hidden rounded-xl border bg-background"
                      >
                        <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
                          <button
                            type="button"
                            className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
                            onClick={() =>
                              setExpandedGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(groupId)) next.delete(groupId);
                                else next.add(groupId);
                                return next;
                              })
                            }
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            {PERMISSION_GROUP_LABELS[groupId]}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              ({selectedInGroup}/{groupPerms.length})
                            </span>
                          </button>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox
                              checked={isGroupFullySelected(groupId)}
                              onCheckedChange={(v) =>
                                toggleGroup(groupId, Boolean(v))
                              }
                            />
                            All
                          </label>
                        </div>
                        {expanded ? (
                          <div className="divide-y">
                            {groupPerms.map((permission) => {
                              const checked =
                                form.permissions.includes(permission);
                              return (
                                <label
                                  key={permission}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/30",
                                    checked && "bg-primary/[0.03]",
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() =>
                                      togglePermission(permission)
                                    }
                                    className="mt-0.5"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium">
                                      {PERMISSION_FULL_LABEL[permission]}
                                    </div>
                                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                      {PERMISSION_DESCRIPTIONS[permission] ??
                                        permission.replaceAll("_", " ")}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
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
                    Clone system roles to start from a template.
                  </span>
                )}

                <Button
                  type="submit"
                  disabled={saving || !tenantSlug}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
          </CardContent>
        </Card>
      </div>
    </UsersModuleShell>
  );
}
