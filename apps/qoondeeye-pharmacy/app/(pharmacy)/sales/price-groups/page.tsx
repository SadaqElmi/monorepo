"use client";

import * as React from "react";
import { Loader2, Plus, Save, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStoredUser } from "@/lib/auth-client";
import {
  createPriceGroup,
  getPriceGroups,
  updatePriceGroup,
  type PriceGroup,
} from "@/lib/api";

type Draft = {
  code: string;
  name: string;
  description: string;
};

const emptyDraft: Draft = { code: "", name: "", description: "" };

export default function PriceGroupsPage() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [rows, setRows] = React.useState<PriceGroup[]>([]);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [editing, setEditing] = React.useState<Record<string, Draft>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await getPriceGroups(tenantSlug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load price groups");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createRow() {
    if (!tenantSlug || !draft.code.trim() || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createPriceGroup(tenantSlug, {
        code: draft.code.trim(),
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
      });
      setDraft(emptyDraft);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create price group");
    } finally {
      setSaving(false);
    }
  }

  async function saveRow(row: PriceGroup) {
    const next = editing[row.id];
    if (!tenantSlug || !next) return;
    setSaving(true);
    setError(null);
    try {
      await updatePriceGroup(tenantSlug, row.id, {
        code: next.code.trim(),
        name: next.name.trim(),
        description: next.description.trim() || null,
      });
      setEditing((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save price group");
    } finally {
      setSaving(false);
    }
  }

  async function patch(row: PriceGroup, input: Partial<PriceGroup>) {
    setSaving(true);
    setError(null);
    try {
      await updatePriceGroup(tenantSlug, row.id, input);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update price group");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Price Groups
          </h1>
          <p className="text-sm text-muted-foreground">
            Customer-facing price tiers used by POS and sales pricing.
          </p>
        </div>
        <Button onClick={load} variant="outline" disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 border-b pb-5 md:grid-cols-[1fr_1fr_2fr_auto]">
        <div className="space-y-2">
          <Label>Code</Label>
          <Input
            value={draft.code}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            placeholder="WHOLESALE"
          />
        </div>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Wholesale"
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input
            value={draft.description}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="Optional notes"
          />
        </div>
        <Button className="self-end" onClick={createRow} disabled={saving}>
          <Plus className="mr-2 size-4" />
          Add
        </Button>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Default</TableHead>
            <TableHead className="w-64 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const edit = editing[row.id] ?? {
              code: row.code,
              name: row.name,
              description: row.description ?? "",
            };
            const isEditing = Boolean(editing[row.id]);
            return (
              <TableRow key={row.id}>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={edit.code}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [row.id]: { ...edit, code: e.target.value },
                        }))
                      }
                    />
                  ) : (
                    row.code
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={edit.name}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [row.id]: { ...edit, name: e.target.value },
                        }))
                      }
                    />
                  ) : (
                    row.name
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={edit.description}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [row.id]: { ...edit, description: e.target.value },
                        }))
                      }
                    />
                  ) : (
                    row.description ?? "-"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={row.active ? "default" : "secondary"}>
                    {row.active ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.isDefault ? (
                    <Badge>Default</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => patch(row, { isDefault: true })}
                      disabled={saving || !row.active}
                    >
                      <Star className="mr-2 size-4" />
                      Set
                    </Button>
                  )}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {isEditing ? (
                    <Button size="sm" onClick={() => saveRow(row)} disabled={saving}>
                      <Save className="mr-2 size-4" />
                      Save
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditing((prev) => ({ ...prev, [row.id]: edit }))
                      }
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patch(row, { active: !row.active })}
                    disabled={saving || row.isDefault}
                  >
                    {row.active ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </main>
  );
}
