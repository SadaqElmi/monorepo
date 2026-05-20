"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  createReturn,
  deleteReturn,
  getReturnById,
  getReturns,
  getSaleById,
  getSales,
  updateReturn,
  type ReturnRecord,
  type Sale,
  type SaleItem,
} from "@/lib/api";
import { Edit2, Eye, Loader2, Plus, Search, Trash2 } from "lucide-react";

type FormMode = "create" | "edit";

type EditableReturn = {
  id: string;
  saleId: string;
  saleItemId: string;
  quantity: string;
  reason: string;
};

type ReturnsBundle = {
  returns: ReturnRecord[];
  sales: Sale[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function ReturnsPage() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const returnsQuery = useQuery({
    queryKey: erpKeys.returns(tenantSlug, branchFacet),
    queryFn: async (): Promise<ReturnsBundle> => {
      const [returnsData, salesData] = await Promise.all([
        getReturns(tenantSlug),
        getSales(tenantSlug),
      ]);
      return { returns: returnsData, sales: salesData };
    },
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_LIST,
  });
  const rows = returnsQuery.data?.returns ?? [];
  const sales = returnsQuery.data?.sales ?? [];
  const loading = returnsQuery.isPending;
  const loadError = returnsQuery.error;
  const [error, setError] = React.useState<string | null>(null);
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load returns"
        : null);

  const [query, setQuery] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("create");
  const [activeReturn, setActiveReturn] = React.useState<EditableReturn | null>(
    null,
  );
  const [saving, setSaving] = React.useState(false);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<ReturnRecord | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsRecord, setDetailsRecord] = React.useState<ReturnRecord | null>(null);

  const [saleItems, setSaleItems] = React.useState<SaleItem[]>([]);
  const [loadingSaleItems, setLoadingSaleItems] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) =>
      (b.return_date ?? "").localeCompare(a.return_date ?? ""),
    );
    if (!q) return sorted;
    return sorted.filter((r) =>
      [r.id, r.sale_id, r.reason ?? "", r.branch_id ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const openCreate = () => {
    setFormMode("create");
    setSaleItems([]);
    setActiveReturn({
      id: "",
      saleId: "",
      saleItemId: "",
      quantity: "1",
      reason: "",
    });
    setFormOpen(true);
  };

  const openEdit = (row: ReturnRecord) => {
    setFormMode("edit");
    setSaleItems([]);
    setActiveReturn({
      id: row.id,
      saleId: row.sale_id,
      saleItemId: "",
      quantity: "1",
      reason: row.reason ?? "",
    });
    setFormOpen(true);
  };

  const openDetails = async (row: ReturnRecord) => {
    if (!tenantSlug) return;
    try {
      setDetailsOpen(true);
      setDetailsLoading(true);
      setDetailsRecord(null);
      const record = await getReturnById(tenantSlug, row.id);
      setDetailsRecord(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load return details");
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setActiveReturn(null);
    setSaleItems([]);
  };

  const handleSaleChange = async (saleId: string) => {
    if (!tenantSlug) return;
    setActiveReturn((prev) =>
      prev ? { ...prev, saleId, saleItemId: "" } : prev,
    );
    if (!saleId) {
      setSaleItems([]);
      return;
    }
    try {
      setLoadingSaleItems(true);
      const sale = await getSaleById(tenantSlug, saleId);
      setSaleItems(sale?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sale items");
      setSaleItems([]);
    } finally {
      setLoadingSaleItems(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !activeReturn) return;

    try {
      setSaving(true);
      setError(null);

      if (formMode === "create") {
        const qty = Number(activeReturn.quantity);
        if (!activeReturn.saleId.trim() || !activeReturn.saleItemId.trim()) {
          setError("Sale ID and Sale Item ID are required.");
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          setError("Quantity must be greater than 0.");
          return;
        }

        await createReturn(tenantSlug, {
          saleId: activeReturn.saleId.trim(),
          reason: activeReturn.reason.trim() || undefined,
          items: [
            {
              saleItemId: activeReturn.saleItemId.trim(),
              quantity: qty,
            },
          ],
        });
      } else {
        const updated = await updateReturn(tenantSlug, activeReturn.id, {
          reason: activeReturn.reason.trim() || undefined,
        });
        if (!updated) {
          setError("Return not found (it may have been deleted).");
          return;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["erp", "returns"] });
      setFormOpen(false);
      setActiveReturn(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save return");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (row: ReturnRecord) => {
    setDeleteCandidate(row);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!tenantSlug || !deleteCandidate) return;
    try {
      setDeletingId(deleteCandidate.id);
      setError(null);
      await deleteReturn(tenantSlug, deleteCandidate.id);
      await queryClient.invalidateQueries({ queryKey: ["erp", "returns"] });
      setDeleteOpen(false);
      setDeleteCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete return");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Returns Management</h1>
              <p className="text-sm text-muted-foreground">
                Create, review, edit and remove sale return records.
              </p>
            </div>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              New Return
            </Button>
          </div>

          {displayError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {displayError}
            </div>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Returns</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search returns..."
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading returns...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No returns found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Return ID</TableHead>
                        <TableHead>Sale ID</TableHead>
                        <TableHead>Branch ID</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.id}</TableCell>
                          <TableCell className="font-mono text-xs">{row.sale_id}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.branch_id ?? "—"}
                          </TableCell>
                          <TableCell>{row.reason ?? "—"}</TableCell>
                          <TableCell>{formatDate(row.return_date)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDetails(row)}
                              >
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">View return</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(row)}
                              >
                                <Edit2 className="h-4 w-4" />
                                <span className="sr-only">Edit return</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => requestDelete(row)}
                                disabled={deletingId === row.id}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete return</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        <Sheet
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) closeForm();
            else setFormOpen(true);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <form onSubmit={handleSubmit} className="flex h-full flex-col">
              <SheetHeader className="border-b">
                <SheetTitle>
                  {formMode === "create" ? "Create return" : "Edit return"}
                </SheetTitle>
                <SheetDescription>
                  {formMode === "create"
                    ? "Provide sale and sale item details for this return."
                    : "Update the return reason."}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {!activeReturn ? null : (
                  <>
                    {formMode === "create" ? (
                      <>
                        <div className="space-y-1.5">
                          <Label>Sale</Label>
                          <Select
                            value={activeReturn.saleId}
                            onValueChange={handleSaleChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select sale" />
                            </SelectTrigger>
                            <SelectContent>
                              {sales.map((sale) => (
                                <SelectItem key={sale.id} value={sale.id}>
                                  {sale.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Sale Item</Label>
                          <Select
                            value={activeReturn.saleItemId}
                            onValueChange={(saleItemId) =>
                              setActiveReturn((prev) =>
                                prev ? { ...prev, saleItemId } : prev,
                              )
                            }
                            disabled={!activeReturn.saleId || loadingSaleItems}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={
                                  loadingSaleItems
                                    ? "Loading sale items..."
                                    : "Select sale item"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {saleItems.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.id} | Qty sold: {item.quantity ?? 0}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="quantity">Quantity</Label>
                          <Input
                            id="quantity"
                            type="number"
                            min={1}
                            value={activeReturn.quantity}
                            onChange={(e) =>
                              setActiveReturn((prev) =>
                                prev ? { ...prev, quantity: e.target.value } : prev,
                              )
                            }
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                        <div>
                          Return ID: <span className="font-mono">{activeReturn.id}</span>
                        </div>
                        <div>
                          Sale ID: <span className="font-mono">{activeReturn.saleId}</span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="reason">Reason (optional)</Label>
                      <Input
                        id="reason"
                        value={activeReturn.reason}
                        onChange={(e) =>
                          setActiveReturn((prev) =>
                            prev ? { ...prev, reason: e.target.value } : prev,
                          )
                        }
                        placeholder="Damaged package, wrong item, etc."
                      />
                    </div>
                  </>
                )}
              </div>

              <SheetFooter className="border-t">
                <div className="flex w-full items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !activeReturn}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {formMode === "create" ? "Create return" : "Save changes"}
                  </Button>
                </div>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>

        <Sheet
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) setDeleteCandidate(null);
          }}
        >
          <SheetContent side="bottom" className="sm:max-w-none">
            <SheetHeader className="border-b">
              <SheetTitle>Delete return</SheetTitle>
              <SheetDescription>
                This action cannot be undone and will reverse stock adjustments.
              </SheetDescription>
            </SheetHeader>
            <div className="p-4">
              {deleteCandidate ? (
                <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                  <p className="font-medium">Return ID: {deleteCandidate.id}</p>
                  <p className="text-muted-foreground">Sale ID: {deleteCandidate.sale_id}</p>
                </div>
              ) : null}
            </div>
            <SheetFooter className="border-t">
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteCandidate(null);
                  }}
                  disabled={!!deletingId}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={!deleteCandidate || !!deletingId}
                >
                  {deletingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Delete return
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Sheet
          open={detailsOpen}
          onOpenChange={(open) => {
            setDetailsOpen(open);
            if (!open) setDetailsRecord(null);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg">
            <SheetHeader className="border-b">
              <SheetTitle>Return details</SheetTitle>
              <SheetDescription>
                Loaded from <code className="text-xs">GET /api/sale-returns/:id</code>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-3 p-4 text-sm">
              {detailsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading details...
                </div>
              ) : !detailsRecord ? (
                <p className="text-muted-foreground">No details found.</p>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="font-medium">Return ID</p>
                    <p className="font-mono text-xs">{detailsRecord.id}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="font-medium">Sale ID</p>
                    <p className="font-mono text-xs">{detailsRecord.sale_id}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="font-medium">Branch ID</p>
                    <p className="font-mono text-xs">{detailsRecord.branch_id ?? "—"}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="font-medium">Reason</p>
                    <p>{detailsRecord.reason ?? "—"}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="font-medium">Return Date</p>
                    <p>{formatDate(detailsRecord.return_date)}</p>
                  </div>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
  );
}
