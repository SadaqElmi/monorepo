"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  Plus,
  Store,
  Trash2,
  User,
  Users2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  StaffMember,
  SystemUser,
  Tenant,
  createStaff,
  createSystemUser,
  deleteStaff,
  deleteSystemUser,
  getStaff,
  getSystemUsers,
  getTenants,
  register,
  updateStaff,
  updateSystemUser,
} from "@/lib/api";

type FormMode = "create" | "edit";

/** Unified row for table: system user or tenant staff */
export type UnifiedUser =
  | { type: "system"; tenantSlug?: never; tenantName?: never } & SystemUser
  | {
      type: "tenant";
      tenantSlug: string;
      tenantName: string;
    } & StaffMember;

type EditableStaff = {
  id: string;
  name: string;
  email: string;
  role: string;
  password?: string;
  tenantSlug?: string;
  tenantName?: string;
};

type EditableSystemUser = {
  id: string;
  email: string;
  name: string;
  password?: string;
};

export default function AdminStaffPage() {
  const [allUsers, setAllUsers] = useState<UnifiedUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeStaff, setActiveStaff] = useState<EditableStaff | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<UnifiedUser | null>(
    null,
  );

  const [systemFormOpen, setSystemFormOpen] = useState(false);
  const [systemFormMode, setSystemFormMode] = useState<FormMode>("create");
  const [activeSystemUser, setActiveSystemUser] =
    useState<EditableSystemUser | null>(null);
  const [systemSaving, setSystemSaving] = useState(false);
  const [deletingSystemId, setDeletingSystemId] = useState<string | null>(null);

  // Create pharmacy (admin-only, uses register API)
  const [pharmacyFormOpen, setPharmacyFormOpen] = useState(false);
  const [pharmacyName, setPharmacyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [pharmacyEmail, setPharmacyEmail] = useState("");
  const [pharmacyPassword, setPharmacyPassword] = useState("");
  const [pharmacyPhone, setPharmacyPhone] = useState("");
  const [pharmacyShowPassword, setPharmacyShowPassword] = useState(false);
  const [pharmacySaving, setPharmacySaving] = useState(false);
  const [pharmacyError, setPharmacyError] = useState<string | null>(null);
  const [pharmacySuccess, setPharmacySuccess] = useState<string | null>(null);

  const loadAllUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const [systemUsers, tenantsList] = await Promise.all([
        getSystemUsers(),
        getTenants(),
      ]);
      setTenants(tenantsList);

      const staffByTenant = await Promise.all(
        tenantsList.map(async (t) => {
          try {
            const staffList = await getStaff(t.schemaName);
            return staffList.map((s) => ({
              type: "tenant" as const,
              ...s,
              tenantSlug: t.schemaName,
              tenantName: t.name,
            }));
          } catch {
            return [] as UnifiedUser[];
          }
        }),
      );

      const systemRows: UnifiedUser[] = systemUsers.map((u) => ({
        type: "system",
        ...u,
      }));
      const tenantRows = staffByTenant.flat();
      setAllUsers([...systemRows, ...tenantRows]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load users",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllUsers();
  }, []);

  const handleOpenCreate = () => {
    if (tenants.length === 0) {
      setError("No pharmacies yet. Create a pharmacy first.");
      return;
    }
    setFormMode("create");
    setActiveStaff({
      id: "",
      name: "",
      email: "",
      role: "",
      password: "",
      tenantSlug: tenants[0]?.schemaName ?? "",
      tenantName: tenants[0]?.name ?? "",
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (row: UnifiedUser) => {
    if (row.type === "system") {
      setSystemFormMode("edit");
      setActiveSystemUser({
        id: row.id,
        email: row.email,
        name: row.name ?? "",
        password: "",
      });
      setSystemFormOpen(true);
      return;
    }
    setFormMode("edit");
    setActiveStaff({
      id: row.id,
      name: row.name ?? "",
      email: row.email ?? "",
      role: row.role ?? "",
      password: "",
      tenantSlug: row.tenantSlug,
      tenantName: row.tenantName,
    });
    setFormOpen(true);
  };

  const handleOpenCreateSystemUser = () => {
    setSystemFormMode("create");
    setActiveSystemUser({
      id: "",
      email: "",
      name: "",
      password: "",
    });
    setSystemFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveStaff(null);
  };

  const handleCloseSystemForm = () => {
    if (systemSaving) return;
    setSystemFormOpen(false);
    setActiveSystemUser(null);
  };

  const handleChange = (field: keyof EditableStaff, value: string) => {
    setActiveStaff((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === "tenantSlug") {
        const tenant = tenants.find((t) => t.schemaName === value);
        next.tenantName = tenant?.name ?? value;
      }
      return next;
    });
  };

  const handleChangeSystemUser = (
    field: keyof EditableSystemUser,
    value: string,
  ) => {
    setActiveSystemUser((prev) =>
      prev ? { ...prev, [field]: value } : prev,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = activeStaff?.tenantSlug;
    if (!activeStaff || !slug) return;

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        const created = await createStaff(slug, {
          name: activeStaff.name.trim() || undefined,
          email: activeStaff.email.trim() || undefined,
          password: activeStaff.password?.trim() || undefined,
          role: activeStaff.role.trim() || undefined,
        });
        const tenant = tenants.find((t) => t.schemaName === slug);
        setAllUsers((prev) => [
          {
            type: "tenant",
            ...created,
            tenantSlug: slug,
            tenantName: tenant?.name ?? slug,
          },
          ...prev,
        ]);
      } else {
        const updated = await updateStaff(slug, activeStaff.id, {
          name: activeStaff.name.trim() || undefined,
          email: activeStaff.email.trim() || undefined,
          password: activeStaff.password?.trim() || undefined,
          role: activeStaff.role.trim() || undefined,
        });
        const tenant = tenants.find((t) => t.schemaName === slug);
        setAllUsers((prev) =>
          prev.map((u) =>
            u.type === "tenant" && u.id === updated.id
              ? { type: "tenant" as const, ...updated, tenantSlug: slug, tenantName: tenant?.name ?? slug }
              : u,
          ),
        );
      }

      setFormOpen(false);
      setActiveStaff(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save staff");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitSystemUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSystemUser) return;

    try {
      setSystemSaving(true);
      setError(null);

      if (systemFormMode === "create") {
        const created = await createSystemUser({
          email: activeSystemUser.email.trim(),
          password: activeSystemUser.password?.trim() ?? "",
          name: activeSystemUser.name.trim() || undefined,
        });
        setAllUsers((prev) => [{ type: "system", ...created }, ...prev]);
      } else {
        const updated = await updateSystemUser(activeSystemUser.id, {
          email: activeSystemUser.email.trim() || undefined,
          password: activeSystemUser.password?.trim() || undefined,
          name: activeSystemUser.name.trim() || undefined,
        });
        setAllUsers((prev) =>
          prev.map((u) =>
            u.type === "system" && u.id === updated.id
              ? { type: "system", ...updated }
              : u,
          ),
        );
      }

      setSystemFormOpen(false);
      setActiveSystemUser(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save system user",
      );
    } finally {
      setSystemSaving(false);
    }
  };

  const handleRequestDelete = (row: UnifiedUser) => {
    setPendingDeleteRow(row);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteRow) return;

    if (pendingDeleteRow.type === "system") {
      try {
        setDeletingSystemId(pendingDeleteRow.id);
        setError(null);
        await deleteSystemUser(pendingDeleteRow.id);
        setAllUsers((prev) =>
          prev.filter(
            (u) => !(u.type === "system" && u.id === pendingDeleteRow.id),
          ),
        );
        setDeleteDialogOpen(false);
        setPendingDeleteRow(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete system user",
        );
      } finally {
        setDeletingSystemId(null);
      }
      return;
    }

    try {
      setDeletingId(pendingDeleteRow.id);
      setError(null);
      await deleteStaff(pendingDeleteRow.tenantSlug, pendingDeleteRow.id);
      setAllUsers((prev) =>
        prev.filter(
          (u) => !(u.type === "tenant" && u.id === pendingDeleteRow.id),
        ),
      );
      setDeleteDialogOpen(false);
      setPendingDeleteRow(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete staff");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenCreatePharmacy = () => {
    setPharmacyError(null);
    setPharmacySuccess(null);
    setPharmacyName("");
    setOwnerName("");
    setPharmacyEmail("");
    setPharmacyPassword("");
    setPharmacyPhone("");
    setPharmacyShowPassword(false);
    setPharmacyFormOpen(true);
  };

  const handleClosePharmacyForm = () => {
    if (!pharmacySaving) {
      setPharmacyFormOpen(false);
      setPharmacyError(null);
      setPharmacySuccess(null);
    }
  };

  const handleCreatePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setPharmacyError(null);
    setPharmacySuccess(null);
    setPharmacySaving(true);
    try {
      await register({
        pharmacy_name: pharmacyName.trim(),
        owner_name: ownerName.trim(),
        email: pharmacyEmail.trim(),
        password: pharmacyPassword,
        phone: pharmacyPhone.trim() || undefined,
      });
      setPharmacySuccess(
        `Pharmacy "${pharmacyName.trim()}" and owner account created. They can sign in at /login.`,
      );
      setPharmacyName("");
      setOwnerName("");
      setPharmacyEmail("");
      setPharmacyPassword("");
      setPharmacyPhone("");
      loadAllUsers();
      setTimeout(() => {
        setPharmacyFormOpen(false);
        setPharmacySuccess(null);
      }, 2500);
    } catch (err) {
      setPharmacyError(
        err instanceof Error ? err.message : "Failed to create pharmacy",
      );
    } finally {
      setPharmacySaving(false);
    }
  };

  const sortedUsers = useMemo(
    () =>
      [...allUsers].sort((a, b) => {
        const nameA = a.type === "system" ? a.name ?? a.email : a.name ?? "";
        const nameB = b.type === "system" ? b.name ?? b.email : b.name ?? "";
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      }),
    [allUsers],
  );

  const count = allUsers.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-full"
              onClick={handleOpenCreatePharmacy}
            >
              <Store className="h-4 w-4" />
              New pharmacy
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-full"
              onClick={handleOpenCreateSystemUser}
            >
              <User className="h-4 w-4" />
              New system user
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={handleOpenCreate}
              disabled={tenants.length === 0}
            >
              <Plus className="h-4 w-4" />
              New staff
            </Button>
          </div>
        </header>

        <main className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl">Staff & users</h1>
              <p className="text-sm text-muted-foreground">
                All system users and pharmacy staff. Create, edit, and delete
                accounts.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={loadAllUsers}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh all"}
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>All users</CardTitle>
                <CardDescription>
                  System users (platform) and client/pharmacy staff. Full CRUD.
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                <Users2 className="h-3 w-3" />
                {count} user{count === 1 ? "" : "s"}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading all users…
                </div>
              ) : sortedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No users yet.</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={handleOpenCreatePharmacy}>
                      <Store className="mr-1 h-4 w-4" />
                      New pharmacy
                    </Button>
                    <Button size="sm" onClick={handleOpenCreateSystemUser}>
                      <User className="mr-1 h-4 w-4" />
                      New system user
                    </Button>
                    <Button size="sm" onClick={handleOpenCreate} disabled>
                      <Plus className="mr-1 h-4 w-4" />
                      New staff (create a pharmacy first)
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Pharmacy</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Role</th>
                        <th className="px-3 py-2 font-medium">Created</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedUsers.map((row) => {
                        const rowKey =
                          row.type === "system"
                            ? `system-${row.id}`
                            : `tenant-${row.tenantSlug}-${row.id}`;
                        const created =
                          row.type === "system"
                            ? row.createdAt
                            : row.created_at;
                        const isDeleting =
                          row.type === "system"
                            ? deletingSystemId === row.id
                            : deletingId === row.id;
                        return (
                          <tr key={rowKey} className="align-top">
                            <td className="px-3 py-3">
                              <span
                                className={
                                  row.type === "system"
                                    ? "inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                                    : "inline-flex rounded-full bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary"
                                }
                              >
                                {row.type === "system" ? "System" : "Pharmacy"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {row.type === "tenant"
                                ? row.tenantName
                                : "—"}
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-medium">
                                {row.type === "system"
                                  ? row.name ?? "—"
                                  : row.name ?? "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.id}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-sm">
                                {row.type === "system"
                                  ? row.email
                                  : row.email ?? "—"}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex rounded-full bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                                {row.type === "system"
                                  ? row.role ?? "super_admin"
                                  : row.role ?? "unassigned"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-muted-foreground">
                              {created
                                ? new Date(created).toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleOpenEdit(row)}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  <span className="sr-only">Edit</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => handleRequestDelete(row)}
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (deletingId || deletingSystemId) return;
              setDeleteDialogOpen(open);
              if (!open) setPendingDeleteRow(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {pendingDeleteRow?.type === "system"
                    ? "Delete system user?"
                    : "Remove staff member?"}
                </DialogTitle>
                <DialogDescription>
                  This will permanently remove{" "}
                  <span className="font-medium text-foreground">
                    {pendingDeleteRow?.type === "system"
                      ? pendingDeleteRow.email
                      : pendingDeleteRow?.name ?? "this user"}
                  </span>
                  . This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setPendingDeleteRow(null);
                  }}
                  disabled={Boolean(deletingId || deletingSystemId)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleConfirmDelete()}
                  disabled={
                    !pendingDeleteRow ||
                    deletingId === pendingDeleteRow.id ||
                    deletingSystemId === pendingDeleteRow.id
                  }
                >
                  {deletingId === pendingDeleteRow?.id ||
                  deletingSystemId === pendingDeleteRow?.id ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  {pendingDeleteRow?.type === "system"
                    ? "Delete user"
                    : "Remove staff"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {formOpen && activeStaff && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl">
                <form onSubmit={handleSubmit}>
                  <div className="border-b px-5 py-3">
                    <h2 className="text-base font-semibold">
                      {formMode === "create"
                        ? "Add staff member"
                        : "Edit staff member"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Basic details and role for this pharmacy (client) user.
                    </p>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    {formMode === "create" && (
                      <div className="space-y-1">
                        <Label htmlFor="staff-tenant">Pharmacy</Label>
                        <select
                          id="staff-tenant"
                          value={activeStaff.tenantSlug ?? ""}
                          onChange={(e) =>
                            handleChange("tenantSlug", e.target.value)
                          }
                          required
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {tenants.map((t) => (
                            <option key={t.id} value={t.schemaName}>
                              {t.name} ({t.schemaName})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor="staff-name">Name</Label>
                      <Input
                        id="staff-name"
                        value={activeStaff.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="staff-email">Email</Label>
                      <Input
                        id="staff-email"
                        type="email"
                        value={activeStaff.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                        placeholder="jane@pharmacy.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="staff-role">Role</Label>
                      <Input
                        id="staff-role"
                        value={activeStaff.role}
                        onChange={(e) => handleChange("role", e.target.value)}
                        placeholder="e.g. admin, cashier"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="staff-password">
                        {formMode === "create"
                          ? "Password"
                          : "Password (leave blank to keep unchanged)"}
                      </Label>
                      <Input
                        id="staff-password"
                        type="password"
                        value={activeStaff.password ?? ""}
                        onChange={(e) =>
                          handleChange("password", e.target.value)
                        }
                        placeholder={
                          formMode === "create" ? "Minimum 6 characters" : ""
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCloseForm}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      {formMode === "create"
                        ? "Create staff"
                        : "Save changes"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {systemFormOpen && activeSystemUser && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl">
                <form onSubmit={handleSubmitSystemUser}>
                  <div className="border-b px-5 py-3">
                    <h2 className="text-base font-semibold">
                      {systemFormMode === "create"
                        ? "Create system user"
                        : "Edit system user"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Platform-level account for super admin access.
                    </p>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    <div className="space-y-1">
                      <Label htmlFor="system-user-email">Email</Label>
                      <Input
                        id="system-user-email"
                        type="email"
                        value={activeSystemUser.email}
                        onChange={(e) =>
                          handleChangeSystemUser("email", e.target.value)
                        }
                        required
                        placeholder="admin@pharmacare.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="system-user-name">Name</Label>
                      <Input
                        id="system-user-name"
                        value={activeSystemUser.name}
                        onChange={(e) =>
                          handleChangeSystemUser("name", e.target.value)
                        }
                        placeholder="Platform Admin"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="system-user-password">
                        {systemFormMode === "create"
                          ? "Password"
                          : "Password (leave blank to keep unchanged)"}
                      </Label>
                      <Input
                        id="system-user-password"
                        type="password"
                        value={activeSystemUser.password ?? ""}
                        onChange={(e) =>
                          handleChangeSystemUser("password", e.target.value)
                        }
                        placeholder={
                          systemFormMode === "create"
                            ? "Minimum 6 characters"
                            : ""
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCloseSystemForm}
                      disabled={systemSaving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={systemSaving}>
                      {systemSaving && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      {systemFormMode === "create"
                        ? "Create user"
                        : "Save changes"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {pharmacyFormOpen && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl">
                <form onSubmit={handleCreatePharmacy}>
                  <div className="border-b px-5 py-3">
                    <h2 className="text-base font-semibold">
                      Create pharmacy & owner account
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      New pharmacy (client) and its owner user. Owner can sign in
                      at login.
                    </p>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    <div className="space-y-1">
                      <Label htmlFor="pharmacy_name">Pharmacy name</Label>
                      <div className="relative">
                        <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="pharmacy_name"
                          value={pharmacyName}
                          onChange={(e) => setPharmacyName(e.target.value)}
                          placeholder="e.g. City Pharmacy"
                          required
                          className="h-10 pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="owner_name">Owner name</Label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="owner_name"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          placeholder="Full name"
                          required
                          className="h-10 pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pharmacy_email">Owner email</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="pharmacy_email"
                          type="email"
                          value={pharmacyEmail}
                          onChange={(e) => setPharmacyEmail(e.target.value)}
                          placeholder="owner@pharmacy.com"
                          required
                          className="h-10 pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pharmacy_phone">Phone (optional)</Label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="pharmacy_phone"
                          type="tel"
                          value={pharmacyPhone}
                          onChange={(e) => setPharmacyPhone(e.target.value)}
                          placeholder="+1 234 567 8900"
                          className="h-10 pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pharmacy_password">
                        Password (min 6 characters)
                      </Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="pharmacy_password"
                          type={
                            pharmacyShowPassword ? "text" : "password"
                          }
                          value={pharmacyPassword}
                          onChange={(e) =>
                            setPharmacyPassword(e.target.value)
                          }
                          placeholder="••••••••"
                          required
                          minLength={6}
                          className="h-10 pl-10 pr-11"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPharmacyShowPassword((p) => !p)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Toggle password visibility"
                        >
                          {pharmacyShowPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    {pharmacyError && (
                      <p className="text-sm text-destructive">
                        {pharmacyError}
                      </p>
                    )}
                    {pharmacySuccess && (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        {pharmacySuccess}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClosePharmacyForm}
                      disabled={pharmacySaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={pharmacySaving}
                    >
                      {pharmacySaving && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      Create pharmacy
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
  );
}
