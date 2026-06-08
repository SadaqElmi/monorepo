"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bell,
  Edit2,
  HelpCircle,
  History,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserCog,
} from "lucide-react";

import { AdminCardTableLoading } from "@/components/admin/admin-loading";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SystemUser,
  createSystemUser,
  deleteSystemUser,
  getSystemUsers,
  updateSystemUser,
} from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";

type FormMode = "create" | "edit";

type EditableSystemUser = {
  id: string;
  email: string;
  name: string;
  password?: string;
  role: "super_admin" | "admin";
};

export type SystemUsersPageClientProps = {
  initialUsers?: SystemUser[] | null;
  serverPrefetched?: boolean;
};

export default function SystemUsersPage({
  initialUsers = null,
  serverPrefetched = false,
}: SystemUsersPageClientProps = {}) {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: erpKeys.adminSystemUsers(),
    queryFn: () => getSystemUsers(),
    staleTime: ERP_STALE_LIST,
    initialData: serverPrefetched && initialUsers ? initialUsers : undefined,
  });
  const users = usersQuery.data ?? [];
  const loading = usersQuery.isLoading;
  const loadError = usersQuery.error;
  const [error, setError] = useState<string | null>(null);
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load system users"
        : null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeUser, setActiveUser] = useState<EditableSystemUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<SystemUser | null>(
    null,
  );
  const [query, setQuery] = useState("");

  const handleOpenCreate = () => {
    setFormMode("create");
    setActiveUser({
      id: "",
      email: "",
      name: "",
      password: "",
      role: "super_admin",
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (user: SystemUser) => {
    setFormMode("edit");
    setActiveUser({
      id: user.id,
      email: user.email,
      name: user.name ?? "",
      password: "",
      role: (user.role === "admin" ? "admin" : "super_admin") as
        | "super_admin"
        | "admin",
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveUser(null);
  };

  const handleChange = (field: keyof EditableSystemUser, value: string) => {
    setActiveUser((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        await createSystemUser({
          email: activeUser.email.trim(),
          password: activeUser.password?.trim() ?? "",
          name: activeUser.name.trim() || undefined,
          role: activeUser.role,
        });
      } else {
        await updateSystemUser(activeUser.id, {
          email: activeUser.email.trim() || undefined,
          password: activeUser.password?.trim() || undefined,
          name: activeUser.name.trim() || undefined,
          role: activeUser.role,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["erp", "admin", "system-users"],
      });
      setFormOpen(false);
      setActiveUser(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save system user",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDelete = (user: SystemUser) => {
    setPendingDeleteUser(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteUser) return;
    const id = pendingDeleteUser.id;
    try {
      setDeletingId(id);
      setError(null);
      await deleteSystemUser(id);
      await queryClient.invalidateQueries({
        queryKey: ["erp", "admin", "system-users"],
      });
      setDeleteDialogOpen(false);
      setPendingDeleteUser(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete system user",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const sortedUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...users]
      .filter((u) => {
        if (!q) return true;
        const haystack = [u.name, u.email, u.role, u.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  }, [query, users]);

  const count = users.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
        <div className="flex-1" />

        <div className="hidden items-center gap-2 md:flex">
          <div className="relative w-[420px] max-w-[42vw]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users, roles, or actions..."
              className="h-9 rounded-full pl-9"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <Bell className="h-4 w-4" />
            <span className="sr-only">Notifications</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <HelpCircle className="h-4 w-4" />
            <span className="sr-only">Help</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button className="gap-1.5 rounded-full" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            New System User
          </Button>
        </div>
      </header>

      <main className="space-y-8 p-6 md:p-8">
        <div className="space-y-2">
          <div className="md:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users, roles, or actions..."
                className="h-9 rounded-full pl-9"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                System Users Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage platform administrators and support staff access levels.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {count} user{count === 1 ? "" : "s"} total
            </div>
          </div>
        </div>

        {displayError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {displayError}
          </p>
        )}

        <Card className="ring-1 ring-foreground/10">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b pb-4">
            <div className="space-y-1">
              <CardTitle>User accounts</CardTitle>
              <CardDescription>
                Backed by{" "}
                <code className="font-mono text-xs">/api/system-users</code>.
              </CardDescription>
            </div>
            <div className="hidden items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground md:inline-flex">
              <UserCog className="h-3 w-3" />
              Super admin & platform users
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <AdminCardTableLoading
                message="Loading system users…"
                rows={8}
                cols={4}
              />
            ) : sortedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <p>No system users yet.</p>
                <Button size="sm" className="mt-2" onClick={handleOpenCreate}>
                  <Plus className="mr-1 h-4 w-4" />
                  Create first user
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Name &amp; Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((user, idx) => {
                    const initials = (user.name ?? user.email ?? "U")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join("");
                    const dbRole = user.role ?? "—";
                    const roleTone =
                      dbRole === "super_admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground";
                    const avatarTone =
                      idx % 2 === 0
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300";

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${avatarTone}`}
                            >
                              {initials || "U"}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {user.name ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleTone}`}
                          >
                            {dbRole}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.createdAt
                            ? new Date(user.createdAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "2-digit",
                                  year: "numeric",
                                },
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-full text-muted-foreground hover:text-primary"
                              onClick={() => handleOpenEdit(user)}
                            >
                              <Edit2 className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-full text-muted-foreground hover:text-destructive"
                              onClick={() => handleRequestDelete(user)}
                              disabled={deletingId === user.id}
                            >
                              {deletingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Audit Logs</h2>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <History className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-base font-medium">No recent activity</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Audit logs coming soon. You'll be able to track every
                administrative action here for security purposes.
              </p>
            </CardContent>
          </Card>
        </section>

        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (deletingId) return;
            setDeleteDialogOpen(open);
            if (!open) setPendingDeleteUser(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete system user?</DialogTitle>
              <DialogDescription>
                This will permanently remove{" "}
                <span className="font-medium text-foreground">
                  {pendingDeleteUser?.email ?? "this user"}
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
                  setPendingDeleteUser(null);
                }}
                disabled={Boolean(deletingId)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleConfirmDelete()}
                disabled={
                  !pendingDeleteUser || deletingId === pendingDeleteUser.id
                }
              >
                {deletingId === pendingDeleteUser?.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Delete user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {formOpen && activeUser && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl">
              <form onSubmit={handleSubmit}>
                <div className="border-b px-5 py-3">
                  <h2 className="text-base font-semibold">
                    {formMode === "create"
                      ? "Create system user"
                      : "Edit system user"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Platform-level account used for super admin and internal
                    access.
                  </p>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <div className="space-y-1">
                    <Label htmlFor="system-user-email">Email</Label>
                    <Input
                      id="system-user-email"
                      type="email"
                      value={activeUser.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      required
                      placeholder="admin@pharmacy.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="system-user-name">Name</Label>
                    <Input
                      id="system-user-name"
                      value={activeUser.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Platform Admin"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="system-user-password">
                      {formMode === "create"
                        ? "Password"
                        : "Password (leave blank to keep unchanged)"}
                    </Label>
                    <Input
                      id="system-user-password"
                      type="password"
                      value={activeUser.password ?? ""}
                      onChange={(e) => handleChange("password", e.target.value)}
                      placeholder={
                        formMode === "create" ? "Minimum 6 characters" : ""
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Role</Label>
                    <Select
                      value={activeUser.role}
                      onValueChange={(value) =>
                        handleChange(
                          "role",
                          value as EditableSystemUser["role"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">super_admin</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Roles are stored in the{" "}
                    <code className="font-mono">super_admins</code> table and
                    sent by <code className="font-mono">/api/system-users</code>
                    .
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
                    {formMode === "create" ? "Create user" : "Save changes"}
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
