"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Search,
  Trash2,
  User,
  UserPlus,
  Users2,
  Download,
  ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";

import { getStoredUser } from "@/lib/auth-client";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ALL_PERMISSIONS,
  PERMISSION_FULL_LABEL,
  PERMISSION_SHORT_LABEL,
  type PermissionName,
} from "@/lib/permissions";
import {
  type StaffMember,
  type Branch,
  type Role,
  createStaff,
  deleteStaff,
  getBranches,
  getStaff,
  getRoles,
  updateStaff,
  updateRole,
} from "@/lib/api";

type FormMode = "create" | "edit";

type EditableStaff = {
  id: string;
  name: string;
  staffId: string;
  email: string;
  role: string;
  password?: string;
  pin?: string;
  branchId?: string;
};

function normalizeRoleKey(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function findRoleForMember(member: StaffMember, roles: Role[]): Role | undefined {
  const key = normalizeRoleKey(member.role);
  if (!key) return undefined;
  return roles.find((r) => normalizeRoleKey(r.name) === key);
}

function permissionSetForRole(role: Role | undefined): Set<PermissionName> {
  const set = new Set<PermissionName>();
  if (!role?.permissions?.length) return set;
  for (const p of role.permissions) {
    if (ALL_PERMISSIONS.includes(p as PermissionName)) {
      set.add(p as PermissionName);
    }
  }
  return set;
}

/** Preserve unknown permission strings from the API when PATCHing a role. */
function nextPermissionsForToggle(
  role: Role,
  permission: PermissionName,
  checked: boolean,
): string[] {
  const extras = (role.permissions ?? []).filter(
    (p) => !ALL_PERMISSIONS.includes(p as PermissionName),
  );
  const known = permissionSetForRole(role);
  if (checked) known.add(permission);
  else known.delete(permission);
  return [...extras, ...Array.from(known)];
}

function getRoleBadgeClass(role: string | null | undefined) {
  if (!role?.trim()) {
    return "border-transparent bg-muted text-muted-foreground";
  }
  const r = role.toLowerCase();
  if (r.includes("admin") || r.includes("manager")) {
    return "border-transparent bg-primary/15 text-primary";
  }
  if (r.includes("cashier")) {
    return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
  return "border-transparent bg-secondary text-secondary-foreground";
}

export default function PharmacyStaffPage() {
  const [tenantSlug] = useState(() => getStoredUser()?.tenantSlug ?? "");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roleRecords, setRoleRecords] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeStaff, setActiveStaff] = useState<EditableStaff | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [removePin, setRemovePin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageLength] = useState(15);

  const [permissionSavingKey, setPermissionSavingKey] = useState<
    string | null
  >(null);

  const roleNames = useMemo(
    () =>
      [...roleRecords.map((r) => r.name)].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    [roleRecords],
  );

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
          setRoleRecords(roleRows);
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

  const sortedStaff = useMemo(
    () =>
      [...staff].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
        }),
      ),
    [staff],
  );

  const filteredStaff = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sortedStaff.filter((member) => {
      const roleMatch =
        roleFilter === "all" ||
        normalizeRoleKey(member.role) === normalizeRoleKey(roleFilter);
      const branchMatch =
        branchFilter === "all" ||
        (branchFilter === "none" && !member.branch_id) ||
        member.branch_id === branchFilter;
      const searchMatch =
        !q ||
        (member.name ?? "").toLowerCase().includes(q) ||
        (member.email ?? "").toLowerCase().includes(q) ||
        (member.staff_id ?? "").toLowerCase().includes(q) ||
        (member.role ?? "").toLowerCase().includes(q);
      return roleMatch && branchMatch && searchMatch;
    });
  }, [sortedStaff, searchTerm, roleFilter, branchFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageLength));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedStaff = useMemo(() => {
    const start = (safePage - 1) * pageLength;
    return filteredStaff.slice(start, start + pageLength);
  }, [filteredStaff, safePage, pageLength]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handlePermissionToggle = async (
    member: StaffMember,
    permission: PermissionName,
    checked: boolean,
  ) => {
    if (!tenantSlug) return;
    const role = findRoleForMember(member, roleRecords);
    if (!role) {
      toast.error("Assign a role first", {
        description:
          "Permissions apply to a named role. Edit this team member and choose a role.",
      });
      return;
    }

    const key = `${role.id}:${permission}`;
    try {
      setPermissionSavingKey(key);
      setError(null);
      const permissions = nextPermissionsForToggle(role, permission, checked);
      const updated = await updateRole(tenantSlug, role.id, { permissions });
      setRoleRecords((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      const affected = staff.filter(
        (s) => normalizeRoleKey(s.role) === normalizeRoleKey(role.name),
      ).length;
      toast.success(
        checked
          ? `Granted ${PERMISSION_FULL_LABEL[permission]}`
          : `Removed ${PERMISSION_FULL_LABEL[permission]}`,
        {
          description:
            affected > 1
              ? `Role “${role.name}” is shared by ${affected} team members — all of them inherit this change.`
              : `Updated role “${role.name}”.`,
        },
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update permissions",
      );
    } finally {
      setPermissionSavingKey(null);
    }
  };

  const handleOpenCreate = () => {
    if (!tenantSlug) {
      setError("Unable to determine pharmacy. Please sign in again.");
      return;
    }
    setFormMode("create");
    setActiveStaff({
      id: "",
      name: "",
      staffId: "",
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
      staffId: member.staff_id ?? "",
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
        roleNames.length === 0 ||
        roleNames.some((r) => r.toLowerCase() === roleName.toLowerCase());
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
          if (!activeStaff.staffId.trim()) {
            setError("Staff ID is required for cashier accounts.");
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
          staffId: activeStaff.staffId.trim() || undefined,
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
          staffId: activeStaff.staffId.trim() || undefined,
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
      toast.success("Team member removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove staff");
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportStaff = () => {
    if (!filteredStaff.length) {
      toast.error("No rows to export");
      return;
    }
    const permHeaders = ALL_PERMISSIONS.map((p) => PERMISSION_FULL_LABEL[p]);
    const headers = [
      "Name",
      "Staff ID",
      "Email",
      "Role",
      "Branch",
      "Added",
      ...permHeaders,
    ];
    const rows = filteredStaff.map((member) => {
      const role = findRoleForMember(member, roleRecords);
      const permSet = permissionSetForRole(role);
      const branchName =
        branches.find((b) => b.id === member.branch_id)?.name ?? "";
      const added = member.created_at
        ? format(new Date(member.created_at), "yyyy-MM-dd")
        : "";
      return [
        member.name ?? "",
        member.staff_id ?? "",
        member.email ?? "",
        member.role ?? "",
        branchName,
        added,
        ...ALL_PERMISSIONS.map((p) => (permSet.has(p) ? "yes" : "")),
      ];
    });
    const csvRows = [
      headers.join(","),
      ...rows.map((cells) =>
        cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `staff_${format(new Date(), "dd-MM-yyyy")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exported staff");
  };

  const formRoleIsCashier =
    formOpen && activeStaff
      ? activeStaff.role.trim().toLowerCase() === "cashier"
      : false;

  const uniqueRolesForFilter = useMemo(
    () =>
      [
        ...new Set(
          staff.map((s) => s.role).filter((r): r is string => Boolean(r?.trim())),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [staff],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
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
            <span className="hidden sm:inline">Add team member</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </header>

        <main className="flex flex-1 flex-col gap-4 p-6 md:p-8">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Staff & users
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage accounts, branch assignment, and role permissions in one
                  matrix.
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

            <Card className="overflow-hidden border-0 shadow-md">
              <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Team directory</CardTitle>
                    <CardDescription>
                      Permission columns update the{" "}
                      <span className="font-medium text-foreground">role</span>{" "}
                      assigned to each person — anyone sharing that role inherits
                      the same access.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-fit gap-1.5 sm:mt-0"
                    asChild
                  >
                    <Link href="/configuration/roles">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Manage roles
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <Select
                        value={roleFilter}
                        onValueChange={(v) => {
                          setRoleFilter(v);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All roles</SelectItem>
                          {uniqueRolesForFilter.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={branchFilter}
                        onValueChange={(v) => {
                          setBranchFilter(v);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Branch" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All branches</SelectItem>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name?.trim() || b.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="relative min-w-[200px] flex-1 max-w-md">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search name, email, Staff ID…"
                          value={searchTerm}
                          onChange={(e) => handleSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        type="button"
                        onClick={handleExportStaff}
                      >
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading team…
                    </div>
                  ) : sortedStaff.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
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
                    <>
                      <div className="relative overflow-x-auto rounded-xl border border-border/80">
                        <table className="w-max min-w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <th className="sticky left-0 z-20 min-w-[200px] bg-muted/95 px-4 py-3 backdrop-blur-sm">
                                Member
                              </th>
                              <th className="whitespace-nowrap px-3 py-3">
                                Staff ID
                              </th>
                              <th className="min-w-[140px] px-3 py-3">
                                Email
                              </th>
                              <th className="whitespace-nowrap px-3 py-3">
                                Role
                              </th>
                              <th className="whitespace-nowrap px-3 py-3">
                                Branch
                              </th>
                              {ALL_PERMISSIONS.map((p) => (
                                <th
                                  key={p}
                                  className="w-14 min-w-13 px-1 py-3 text-center"
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help text-[10px] leading-tight">
                                        {PERMISSION_SHORT_LABEL[p]}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">
                                      {PERMISSION_FULL_LABEL[p]}
                                    </TooltipContent>
                                  </Tooltip>
                                </th>
                              ))}
                              <th className="whitespace-nowrap px-3 py-3">
                                Added
                              </th>
                              <th className="sticky right-0 z-20 min-w-[96px] bg-muted/95 px-3 py-3 text-right backdrop-blur-sm">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {paginatedStaff.map((member) => {
                              const role = findRoleForMember(
                                member,
                                roleRecords,
                              );
                              const permSet = permissionSetForRole(role);
                              const branchLabel =
                                branches.find((b) => b.id === member.branch_id)
                                  ?.name ?? "—";

                              return (
                                <tr
                                  key={member.id}
                                  className="transition-colors hover:bg-muted/40"
                                >
                                  <td className="sticky left-0 z-10 bg-background px-4 py-3 shadow-[4px_0_12px_-8px_rgba(0,0,0,0.25)]">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <User className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="truncate font-medium">
                                          {member.name || "—"}
                                        </p>
                                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                                          {member.id.slice(0, 8)}…
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                                    {member.staff_id || "—"}
                                  </td>
                                  <td className="max-w-[180px] px-3 py-3">
                                    <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                                      <Mail className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate">
                                        {member.email || "—"}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "border-transparent text-xs font-medium",
                                        getRoleBadgeClass(member.role),
                                      )}
                                    >
                                      {member.role?.trim() || "Unassigned"}
                                    </Badge>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                                    {branchLabel}
                                  </td>
                                  {ALL_PERMISSIONS.map((p) => {
                                    const busy =
                                      permissionSavingKey === `${role?.id}:${p}`;
                                    const disabled = !role;
                                    return (
                                      <td
                                        key={p}
                                        className="px-1 py-2 text-center align-middle"
                                      >
                                        <div className="flex justify-center">
                                          {busy ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                          ) : (
                                            <Checkbox
                                              checked={permSet.has(p)}
                                              disabled={disabled}
                                              onCheckedChange={(v) =>
                                                void handlePermissionToggle(
                                                  member,
                                                  p,
                                                  v === true,
                                                )
                                              }
                                              className="border-muted-foreground/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                                              aria-label={`${PERMISSION_FULL_LABEL[p]} for ${member.name ?? member.id}`}
                                            />
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                                    {member.created_at
                                      ? format(
                                          new Date(member.created_at),
                                          "MMM d, yyyy",
                                        )
                                      : "—"}
                                  </td>
                                  <td className="sticky right-0 z-10 bg-background px-3 py-2 text-right shadow-[-4px_0_12px_-8px_rgba(0,0,0,0.25)]">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10"
                                        onClick={() =>
                                          handleOpenEdit(member)
                                        }
                                        title="Edit"
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                        onClick={() =>
                                          handleDelete(member.id)
                                        }
                                        disabled={deletingId === member.id}
                                        title="Remove"
                                      >
                                        {deletingId === member.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {filteredStaff.length === 0 && sortedStaff.length > 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          No team members match your filters.
                        </p>
                      )}

                      {totalPages > 1 && (
                        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            {(safePage - 1) * pageLength + 1}–
                            {Math.min(
                              safePage * pageLength,
                              filteredStaff.length,
                            )}{" "}
                            of {filteredStaff.length}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={safePage <= 1}
                              onClick={() =>
                                setPage((p) =>
                                  Math.max(
                                    1,
                                    Math.min(p, totalPages) - 1,
                                  ),
                                )
                              }
                            >
                              Previous
                            </Button>
                            <span className="text-sm tabular-nums text-muted-foreground">
                              Page {safePage} / {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={safePage >= totalPages}
                              onClick={() =>
                                setPage((p) =>
                                  Math.min(
                                    totalPages,
                                    Math.min(p, totalPages) + 1,
                                  ),
                                )
                              }
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {formOpen && activeStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-xl">
              <div className="border-b border-border/60 px-6 py-4">
                <h2 className="text-lg font-semibold">
                  {formMode === "create"
                    ? "Add team member"
                    : "Edit team member"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formMode === "create"
                    ? "They will be able to sign in with this pharmacy."
                    : "Update name, email, role, password, or POS PIN."}
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
                  <Label htmlFor="staff-pos-id">Staff ID</Label>
                  <Input
                    id="staff-pos-id"
                    type="text"
                    value={activeStaff.staffId}
                    onChange={(e) => handleChange("staffId", e.target.value)}
                    placeholder="e.g. frontdesk.main"
                    required={formRoleIsCashier}
                    className="h-10 rounded-lg font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used by the POS for sign-in with PIN (cashier role).
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
                    Optional contact address; not used as the POS Staff ID.
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
                      {roleNames.map((name) => (
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
                    value={
                      activeStaff.branchId?.trim()
                        ? activeStaff.branchId
                        : "__none__"
                    }
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
                    Cashier, staff, and manager users must be assigned to one
                    branch.
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
                      required={formMode === "create"}
                      minLength={formMode === "create" ? 6 : undefined}
                      className="h-10 rounded-lg pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          id="staff-remove-pin"
                          checked={removePin}
                          onCheckedChange={(checked) => {
                            const next = checked === true;
                            setRemovePin(next);
                            if (next) handleChange("pin", "");
                          }}
                        />
                        <Label
                          htmlFor="staff-remove-pin"
                          className="cursor-pointer text-xs text-muted-foreground"
                        >
                          Remove PIN (cashier cannot use POS until a new PIN is
                          set)
                        </Label>
                      </div>
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
    </TooltipProvider>
  );
}
