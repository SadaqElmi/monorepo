"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MoreHorizontal,
  Trash2,
  User,
  UserPlus,
  Users2,
} from "lucide-react";

import { getStoredUser } from "@/lib/auth-client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Separator } from "@repo/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import {
  type StaffMember,
  type Branch,
  createStaff,
  deleteStaff,
  getBranches,
  getStaff,
  getRoles,
  updateStaff,
} from "@/lib/api";

type FormMode = "create" | "edit";

type EditableStaff = {
  id: string;
  name: string;
  cashierId: string;
  email: string;
  role: string;
  password?: string;
  /** New PIN for cashier (create/edit); never shown when editing */
  pin?: string;
  branchId?: string;
};

export default function PharmacyStaffPage() {
  const [tenantSlug] = useState(() => getStoredUser()?.tenantSlug ?? "");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeStaff, setActiveStaff] = useState<EditableStaff | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [removePin, setRemovePin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [data, roleRows, branchRows] = await Promise.all([
          getStaff(tenantSlug),
          getRoles(tenantSlug),
          getBranches(tenantSlug),
        ]);
        if (!cancelled) {
          setStaff(data);
          setRoles(
            roleRows.map((r) => r.name).sort((a, b) => a.localeCompare(b)),
          );
          setBranches(branchRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load staff");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const handleOpenCreate = () => {
    if (!tenantSlug) {
      setError("Unable to determine pharmacy. Please sign in again.");
      return;
    }
    setFormMode("create");
    setActiveStaff({
      id: "",
      name: "",
      cashierId: "",
      email: "",
      role: "",
      password: "",
      pin: "",
      branchId: "",
    });
    setShowPassword(false);
    setRemovePin(false);
    setFormOpen(true);
  };

  const handleOpenEdit = (member: StaffMember) => {
    setFormMode("edit");
    setActiveStaff({
      id: member.id,
      name: member.name ?? "",
      cashierId: member.cashier_id ?? "",
      email: member.email ?? "",
      role: member.role ?? "",
      password: "",
      pin: "",
      branchId: member.branch_id ?? "",
    });
    setShowPassword(false);
    setRemovePin(false);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveStaff(null);
  };

  const handleChange = (field: keyof EditableStaff, value: string) => {
    setActiveStaff((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStaff || !tenantSlug) return;

    try {
      setSaving(true);
      setError(null);

      const roleName = activeStaff.role.trim();
      const isCashier = roleName.toLowerCase() === "cashier";
      const roleOk =
        !roleName ||
        roles.length === 0 ||
        roles.some((r) => r.toLowerCase() === roleName.toLowerCase());
      if (!roleOk) {
        setError(
          `Role "${roleName}" does not exist for this pharmacy. Create it in Roles first (or pick an existing role from the list).`,
        );
        return;
      }

      if (formMode === "create") {
        if (!activeStaff.password?.trim() || activeStaff.password.length < 6) {
          setError("Password is required (min 6 characters).");
          return;
        }

        if (isCashier) {
          if (!activeStaff.cashierId.trim()) {
            setError("Cashier ID is required for cashier accounts.");
            return;
          }
          const pin = activeStaff.pin?.trim() ?? "";
          if (pin.length < 4) {
            setError(
              "Cashiers need a PIN (4–12 digits) to sign in at the POS.",
            );
            return;
          }
        }

        const created = await createStaff(tenantSlug, {
          name: activeStaff.name.trim() || undefined,
          cashierId: activeStaff.cashierId.trim() || undefined,
          email: activeStaff.email.trim() || undefined,
          password: activeStaff.password?.trim() || undefined,
          role: roleName || undefined,
          pin: isCashier ? activeStaff.pin?.trim() : undefined,
          branchId: activeStaff.branchId?.trim() || undefined,
        });
        setStaff((prev) => [created, ...prev]);
      } else {
        const payload: Parameters<typeof updateStaff>[2] = {
          name: activeStaff.name.trim() || undefined,
          cashierId: activeStaff.cashierId.trim() || undefined,
          email: activeStaff.email.trim() || undefined,
          password: activeStaff.password?.trim() || undefined,
          role: roleName || undefined,
          branchId: activeStaff.branchId?.trim() || undefined,
        };
        if (isCashier) {
          if (removePin) payload.pin = "";
          else if (activeStaff.pin?.trim())
            payload.pin = activeStaff.pin.trim();
        }
        const updated = await updateStaff(tenantSlug, activeStaff.id, payload);
        setStaff((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
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

  const handleDelete = async (id: string) => {
    if (!tenantSlug) return;
    if (
      !window.confirm(
        "Remove this team member? They will no longer be able to sign in.",
      )
    ) {
      return;
    }

    try {
      setDeletingId(id);
      setError(null);
      await deleteStaff(tenantSlug, id);
      setStaff((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove staff");
    } finally {
      setDeletingId(null);
    }
  };

  const sortedStaff = useMemo(
    () =>
      [...staff].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
        }),
      ),
    [staff],
  );

  const formRoleIsCashier =
    formOpen && activeStaff
      ? activeStaff.role.trim().toLowerCase() === "cashier"
      : false;

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
                <BreadcrumbItem>
                  <BreadcrumbPage>Staff & users</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Button
            size="sm"
            className="gap-1.5 rounded-full bg-primary shadow-md shadow-primary/20 hover:bg-primary/90"
            onClick={handleOpenCreate}
          >
            <UserPlus className="h-4 w-4" />
            Add team member
          </Button>
        </header>

        <main className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Staff & users
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your pharmacy team. Add employees, assign roles, and
                control access.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Users2 className="h-3.5 w-3.5" />
              {staff.length} member{staff.length === 1 ? "" : "s"}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-muted/30 px-6 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Team directory</CardTitle>
                  <CardDescription>
                    Everyone who can sign in to this pharmacy. Edit roles or
                    remove access as needed.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading team…
                </div>
              ) : sortedStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Users2 className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No team members yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Add employees so they can sign in and help run your
                    pharmacy.
                  </p>
                  <Button
                    className="mt-2 gap-2 rounded-xl"
                    onClick={handleOpenCreate}
                  >
                    <UserPlus className="h-4 w-4" />
                    Add first team member
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border/60 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Cashier ID</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Branch</th>
                        <th className="px-6 py-4">Added</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {sortedStaff.map((member) => (
                        <tr
                          key={member.id}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <User className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">
                                  {member.name || "—"}
                                </p>
                                <p className="text-[11px] text-muted-foreground font-mono">
                                  {member.id.slice(0, 8)}…
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs">
                              {member.cashier_id || "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              {member.email || "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              {member.role || "Unassigned"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {branches.find((b) => b.id === member.branch_id)?.name ??
                              "—"}
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {member.created_at
                              ? new Date(member.created_at).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "—"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg"
                                    aria-label="Open actions menu"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleOpenEdit(member)}
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(member.id)}
                                    disabled={deletingId === member.id}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    {deletingId === member.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="mr-2 h-4 w-4" />
                                    )}
                                    Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* Add / Edit modal */}
        {formOpen && activeStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card shadow-xl">
              <div className="border-b border-border/60 px-6 py-4">
                <h2 className="text-lg font-semibold">
                  {formMode === "create"
                    ? "Add team member"
                    : "Edit team member"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formMode === "create"
                    ? "They will be able to sign in with this pharmacy."
                    : "Update name, email, role, password, or cashier PIN."}
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
                <div className="space-y-2">
                  <Label htmlFor="staff-name">Full name</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="staff-name"
                      value={activeStaff.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="h-10 rounded-lg pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-cashier-id">
                    Cashier ID
                  </Label>
                  <Input
                    id="staff-cashier-id"
                    type="text"
                    value={activeStaff.cashierId}
                    onChange={(e) => handleChange("cashierId", e.target.value)}
                    placeholder="e.g. cashier.frontdesk"
                    required={formRoleIsCashier}
                    className="h-10 rounded-lg font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used by POS for cashier sign-in with PIN.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Email (optional)</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="staff-email"
                      type="email"
                      value={activeStaff.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="staff@pharmacy.com"
                      className="h-10 rounded-lg pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional contact address; not used as POS cashier ID.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-role">Role</Label>
                  <Select
                    value={
                      activeStaff.role?.trim() ? activeStaff.role : "__none__"
                    }
                    onValueChange={(value) => {
                      const next = value === "__none__" ? "" : value;
                      setActiveStaff((prev) =>
                        prev
                          ? {
                              ...prev,
                              role: next,
                              pin:
                                next.trim().toLowerCase() !== "cashier"
                                  ? ""
                                  : prev.pin,
                            }
                          : prev,
                      );
                      if (next.trim().toLowerCase() !== "cashier") {
                        setRemovePin(false);
                      }
                    }}
                  >
                    <SelectTrigger id="staff-role" className="h-10 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {roles.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Pick one of your created roles. This must match an existing
                    role name to link permissions.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-branch">Assigned branch</Label>
                  <Select
                    value={activeStaff.branchId?.trim() ? activeStaff.branchId : "__none__"}
                    onValueChange={(value) =>
                      handleChange("branchId", value === "__none__" ? "" : value)
                    }
                  >
                    <SelectTrigger id="staff-branch" className="h-10 rounded-lg">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name?.trim() || branch.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Cashier, staff, and manager users must be assigned to one branch.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-password">
                    {formRoleIsCashier
                      ? formMode === "create"
                        ? "Password (min 6 characters)"
                        : "New password (optional; leave blank to keep)"
                      : formMode === "create"
                        ? "Password (min 6 characters)"
                        : "New password (leave blank to keep current)"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="staff-password"
                      type={showPassword ? "text" : "password"}
                      value={activeStaff.password ?? ""}
                      onChange={(e) => handleChange("password", e.target.value)}
                      placeholder={
                        formMode === "create" ? "••••••••" : "Optional"
                      }
                      required={
                        formMode === "create"
                      }
                      minLength={
                        formMode === "create"
                          ? 6
                          : undefined
                      }
                      className="h-10 rounded-lg pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {formRoleIsCashier && (
                  <div className="space-y-2">
                    <Label htmlFor="staff-pin">
                      {formMode === "create"
                        ? "POS PIN (4–12 digits)"
                        : "New POS PIN (optional)"}
                    </Label>
                    <Input
                      id="staff-pin"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={formMode === "edit" && removePin}
                      value={activeStaff.pin ?? ""}
                      onChange={(e) =>
                        handleChange(
                          "pin",
                          e.target.value.replace(/\D/g, "").slice(0, 12),
                        )
                      }
                      placeholder={formMode === "create" ? "e.g. 1234" : "••••"}
                      className="h-10 rounded-lg font-mono tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground">
                      {formMode === "create"
                        ? "Cashiers sign in at the POS with this PIN and the pharmacy code."
                        : "Leave blank to keep the current PIN."}
                    </p>
                    {formMode === "edit" && (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="rounded border-input"
                          checked={removePin}
                          onChange={(e) => {
                            setRemovePin(e.target.checked);
                            if (e.target.checked) handleChange("pin", "");
                          }}
                        />
                        Remove PIN (cashier cannot use POS until a new PIN is set)
                      </label>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={handleCloseForm}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 rounded-xl"
                    disabled={saving}
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {formMode === "create" ? "Add member" : "Save changes"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}
