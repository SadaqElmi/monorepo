"use client";

import * as React from "react";
import { Loader2, Plus, Save } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { getStoredUser } from "@/lib/auth-client";
import {
  createUom,
  getUoms,
  updateUom,
  type Uom,
} from "@/lib/api";

type Draft = {
  code: string;
  name: string;
  symbol: string;
};

const emptyDraft: Draft = { code: "", name: "", symbol: "" };

export default function UnitsOfMeasurePage() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [rows, setRows] = React.useState<Uom[]>([]);
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
      setRows(await getUoms(tenantSlug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load UOMs");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createRow = async () => {
    if (!tenantSlug || !draft.code.trim() || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createUom(tenantSlug, {
        code: draft.code.trim(),
        name: draft.name.trim(),
        symbol: draft.symbol.trim() || undefined,
      });
      setDraft(emptyDraft);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create UOM");
    } finally {
      setSaving(false);
    }
  };

  const saveRow = async (row: Uom) => {
    const next = editing[row.id];
    if (!tenantSlug || !next) return;
    setSaving(true);
    setError(null);
    try {
      await updateUom(tenantSlug, row.id, {
        code: next.code.trim(),
        name: next.name.trim(),
        symbol: next.symbol.trim() || null,
      });
      setEditing((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save UOM");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: Uom, active: boolean) => {
    if (!tenantSlug) return;
    setSaving(true);
    setError(null);
    try {
      await updateUom(tenantSlug, row.id, { active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update UOM");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Units of Measure
          </h1>
          <p className="text-sm text-muted-foreground">
            Tenant-wide units used by product conversions.
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

      <section className="grid gap-3 border-b pb-5 md:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="uom-code">Code</Label>
          <Input
            id="uom-code"
            value={draft.code}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            placeholder="BOX"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="uom-name">Name</Label>
          <Input
            id="uom-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Box"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="uom-symbol">Symbol</Label>
          <Input
            id="uom-symbol"
            value={draft.symbol}
            onChange={(e) =>
              setDraft((d) => ({ ...d, symbol: e.target.value }))
            }
            placeholder="Box"
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
            <TableHead>Symbol</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-48 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const edit = editing[row.id] ?? {
              code: row.code,
              name: row.name,
              symbol: row.symbol ?? "",
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
                      value={edit.symbol}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [row.id]: { ...edit, symbol: e.target.value },
                        }))
                      }
                    />
                  ) : (
                    row.symbol ?? "-"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={row.active ? "default" : "secondary"}>
                    {row.active ? "Active" : "Inactive"}
                  </Badge>
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
                        setEditing((prev) => ({
                          ...prev,
                          [row.id]: edit,
                        }))
                      }
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActive(row, !row.active)}
                    disabled={saving}
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
          {!loading && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No units configured.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </main>
  );
}
