"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Edit2, FolderTree, Loader2, Plus, Trash2 } from "lucide-react";

import { getStoredUser } from "@/lib/auth-client";
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
import {
  Category,
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/api";
import { useErpCategories } from "@/hooks/queries/use-erp-categories";
import { erpKeys } from "@/lib/erp-query-keys";

type FormMode = "create" | "edit";

type EditableCategory = {
  id: string;
  name: string;
  description: string;
  slug: string;
};

export type CategoriesPageClientProps = {
  initialCategories?: Category[] | null;
  serverPrefetched?: boolean;
};

export default function CategoriesPage({
  initialCategories = null,
  serverPrefetched = false,
}: CategoriesPageClientProps) {
  const queryClient = useQueryClient();
  const [tenantSlug, setTenantSlug] = useState(() =>
    getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const categoriesQuery = useErpCategories(tenantSlug, {
    initialData:
      serverPrefetched && initialCategories ? initialCategories : undefined,
  });
  const categories = categoriesQuery.data ?? [];
  const loading = categoriesQuery.isPending;
  const loadError = categoriesQuery.error;
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [activeCategory, setActiveCategory] = useState<EditableCategory | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => {
      setFormOpen(false);
      setActiveCategory(null);
    };
    window.addEventListener("activeBranchChanged", handler);
    return () => window.removeEventListener("activeBranchChanged", handler);
  }, []);

  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load categories"
        : null);

  const handleRefresh = () => {
    if (!tenantSlug.trim()) {
      setError("Enter a tenant slug to load categories.");
      return;
    }
    setTenantSlug((prev) => prev.trim());
    void queryClient.invalidateQueries({
      queryKey: erpKeys.categories(tenantSlug, ""),
      exact: false,
    });
  };

  const handleOpenCreate = () => {
    if (!tenantSlug) {
      setError("Set the tenant slug before creating a category.");
      return;
    }
    setFormMode("create");
    setActiveCategory({ id: "", name: "", description: "", slug: "" });
    setFormOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    if (!tenantSlug) return;
    setFormMode("edit");
    setActiveCategory({
      id: cat.id,
      name: cat.name,
      description: cat.description ?? "",
      slug: cat.slug ?? "",
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveCategory(null);
  };

  const handleChange = (field: keyof EditableCategory, value: string) => {
    setActiveCategory((prev) =>
      prev ? { ...prev, [field]: value } : prev,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory || !tenantSlug) return;

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        await createCategory(tenantSlug, {
          name: activeCategory.name.trim(),
          description: activeCategory.description.trim() || undefined,
          slug: activeCategory.slug.trim() || undefined,
          global: true,
        });
      } else {
        await updateCategory(tenantSlug, activeCategory.id, {
          name: activeCategory.name.trim(),
          description: activeCategory.description.trim() || undefined,
          slug: activeCategory.slug.trim() || undefined,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: erpKeys.categories(tenantSlug, ""),
        exact: false,
      });

      setFormOpen(false);
      setActiveCategory(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save category",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantSlug) return;
    if (!window.confirm("Delete this category? Products may become uncategorized.")) {
      return;
    }

    try {
      setDeletingId(id);
      setError(null);
      await deleteCategory(tenantSlug, id);
      await queryClient.invalidateQueries({
        queryKey: erpKeys.categories(tenantSlug, ""),
        exact: false,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete category",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [categories],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />
          <Button
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={handleOpenCreate}
            disabled={!tenantSlug}
          >
            <Plus className="h-4 w-4" />
            New category
          </Button>
        </header>

        <main className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl">Categories</h1>
              <p className="text-sm text-muted-foreground">
                Group products into logical therapeutic categories.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 text-xs text-muted-foreground md:flex-row md:items-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
                <span className="font-medium text-foreground/80">Tenant</span>
                <code className="font-mono">{tenantSlug || "Not set"}</code>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleRefresh}
                disabled={!tenantSlug || !tenantSlug.trim() || loading}
              >
                Refresh
              </Button>
            </div>
          </div>

          {displayError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {displayError}
            </p>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Category list</CardTitle>
                <CardDescription>
                  Backed by <code className="font-mono text-xs">/api/categories</code> with{" "}
                  <code className="font-mono text-xs">X-Tenant</code>.
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                <FolderTree className="h-3 w-3" />
                {categories.length} categor{categories.length === 1 ? "y" : "ies"}
              </div>
            </CardHeader>
            <CardContent>
              {!tenantSlug ? (
                <p className="py-8 text-sm text-muted-foreground">
                  Enter a tenant slug above to load categories.
                </p>
              ) : loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading categories…
                </div>
              ) : sortedCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No categories yet.</p>
                  <Button size="sm" className="mt-2" onClick={handleOpenCreate}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add first category
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Slug</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedCategories.map((cat) => (
                        <tr key={cat.id} className="align-top">
                          <td className="px-3 py-3">
                            <div className="font-medium">{cat.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {cat.id}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {cat.slug ? (
                              <span className="font-mono text-xs">{cat.slug}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {cat.description || "—"}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleOpenEdit(cat)}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDelete(cat.id)}
                                disabled={deletingId === cat.id}
                              >
                                {deletingId === cat.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                <span className="sr-only">Delete</span>
                              </Button>
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

          {formOpen && activeCategory && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl">
                <form onSubmit={handleSubmit}>
                  <div className="border-b px-5 py-3">
                    <h2 className="text-base font-semibold">
                      {formMode === "create"
                        ? "New category"
                        : "Edit category"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Name and optional description for grouping products.
                    </p>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    <div className="space-y-1">
                      <Label htmlFor="cat-name">Name</Label>
                      <Input
                        id="cat-name"
                        value={activeCategory.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        required
                        placeholder="e.g. Antibiotics"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cat-slug">Slug (optional)</Label>
                      <Input
                        id="cat-slug"
                        value={activeCategory.slug}
                        onChange={(e) => handleChange("slug", e.target.value)}
                        placeholder="antibiotics"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cat-desc">Description (optional)</Label>
                      <Input
                        id="cat-desc"
                        value={activeCategory.description}
                        onChange={(e) =>
                          handleChange("description", e.target.value)
                        }
                        placeholder="Broad-spectrum and narrow-spectrum antibiotics"
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
                      {formMode === "create" ? "Create" : "Save changes"}
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
