"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type {
  Branch,
  Product,
  ProductStockByBranch,
  ProductUom,
  Supplier,
} from "@/lib/api";

import type { EditablePurchase, FormMode } from "./bills-types";
import { ProductSearchInput } from "./product-search-input";

export type BillsFormSheetProps = {
  open: boolean;
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  formMode: FormMode;
  activePurchase: EditablePurchase | null;
  setActivePurchase: React.Dispatch<
    React.SetStateAction<EditablePurchase | null>
  >;
  suppliers: Supplier[];
  branches: Branch[];
  products: Product[];
  selectedProductUoms: ProductUom[];
  productStockByBranch: ProductStockByBranch[];
  stockLoading: boolean;
  saving: boolean;
  syncBranchToSession: (branchId: string) => void;
  withAutoTotal: (
    prev: EditablePurchase,
    patch: Partial<EditablePurchase>,
  ) => EditablePurchase;
  onProductChange: (productId: string) => void;
  closeForm: () => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function BillsFormSheet({
  open,
  setFormOpen,
  formMode,
  activePurchase,
  setActivePurchase,
  suppliers,
  branches,
  products,
  selectedProductUoms,
  productStockByBranch,
  stockLoading,
  saving,
  syncBranchToSession,
  withAutoTotal,
  onProductChange,
  closeForm,
  onSubmit,
}: BillsFormSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeForm();
        else setFormOpen(true);
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader className="border-b">
            <SheetTitle>
              {formMode === "create" ? "New purchase" : "Edit purchase"}
            </SheetTitle>
            <SheetDescription>
              Supplier invoice and goods received details.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!activePurchase ? (
              <p className="text-sm text-muted-foreground">
                No purchase selected.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select
                    value={activePurchase.supplierId}
                    onValueChange={(v) =>
                      setActivePurchase((prev) =>
                        prev ? { ...prev, supplierId: v } : prev,
                      )
                    }
                  >
                    <SelectTrigger className="w-full rounded-lg">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name ?? "Unnamed supplier"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Receiving branch</Label>
                  <Select
                    value={activePurchase.branchId}
                    onValueChange={(v) => {
                      syncBranchToSession(v);
                      setActivePurchase((prev) =>
                        prev ? { ...prev, branchId: v } : prev,
                      );
                    }}
                  >
                    <SelectTrigger className="w-full rounded-lg">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name ?? "Unnamed branch"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Stock is added to this branch. Changing branch updates your
                    session scope for the next save.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice-number">Invoice number</Label>
                  <Input
                    id="invoice-number"
                    value={activePurchase.invoiceNumber}
                    onChange={(e) =>
                      setActivePurchase((prev) =>
                        prev ? { ...prev, invoiceNumber: e.target.value } : prev,
                      )
                    }
                    placeholder="e.g. INV-2026-0001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Product</Label>
                  <ProductSearchInput
                    products={products}
                    value={activePurchase.productId}
                    onValueChange={onProductChange}
                    placeholder="Search by item no or name…"
                    inputClassName="h-9 rounded-lg"
                  />
                  {activePurchase.productId ? (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        On-hand by branch (same product, different stock)
                      </p>
                      {stockLoading ? (
                        <p className="text-xs text-muted-foreground">
                          Loading stock…
                        </p>
                      ) : productStockByBranch.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No stock rows yet, or no access to branch scope.
                        </p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="h-8 text-xs">
                                  Branch
                                </TableHead>
                                <TableHead className="h-8 text-right text-xs">
                                  Qty
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {productStockByBranch.map((row) => (
                                <TableRow key={row.branchId}>
                                  <TableCell className="py-1.5 text-xs">
                                    {row.branchName ??
                                      row.branchId.slice(0, 8)}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right text-xs font-mono tabular-nums">
                                    {row.quantity}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="line-quantity">Quantity</Label>
                    <Input
                      id="line-quantity"
                      type="number"
                      min={1}
                      step={1}
                      value={activePurchase.quantity}
                      onChange={(e) =>
                        setActivePurchase((prev) =>
                          prev
                            ? withAutoTotal(prev, {
                                quantity: e.target.value,
                              })
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UOM</Label>
                    <Select
                      value={activePurchase.uomId}
                      onValueChange={(v) =>
                        setActivePurchase((prev) =>
                          prev ? { ...prev, uomId: v } : prev,
                        )
                      }
                      disabled={!selectedProductUoms.length}
                    >
                      <SelectTrigger className="w-full rounded-lg">
                        <SelectValue placeholder="Base" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductUoms.map((uom) => (
                          <SelectItem key={uom.id} value={uom.uomId}>
                            {uom.symbol || uom.code}
                            {uom.isPurchaseDefault ? " · Purchase" : ""}
                            {uom.isBase ? " · Base" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activePurchase.uomId ? (
                      <p className="text-xs text-muted-foreground">
                        Base qty:{" "}
                        {(
                          Number(activePurchase.quantity || 0) *
                          Number(
                            selectedProductUoms.find(
                              (u) => u.uomId === activePurchase.uomId,
                            )?.conversionFactorToBase ?? 1,
                          )
                        ).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="line-batch-number">Batch number</Label>
                    <Input
                      id="line-batch-number"
                      value={activePurchase.batchNumber}
                      onChange={(e) =>
                        setActivePurchase((prev) =>
                          prev ? { ...prev, batchNumber: e.target.value } : prev,
                        )
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="line-cost-price">Cost price</Label>
                    <Input
                      id="line-cost-price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={activePurchase.costPrice}
                      onChange={(e) =>
                        setActivePurchase((prev) =>
                          prev
                            ? withAutoTotal(prev, {
                                costPrice: e.target.value,
                              })
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-selling-price">Selling price</Label>
                    <Input
                      id="line-selling-price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={activePurchase.sellingPrice}
                      onChange={(e) =>
                        setActivePurchase((prev) =>
                          prev
                            ? { ...prev, sellingPrice: e.target.value }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="line-expiry-date">Expiry date</Label>
                  <Input
                    id="line-expiry-date"
                    type="date"
                    value={activePurchase.expiryDate}
                    onChange={(e) =>
                      setActivePurchase((prev) =>
                        prev ? { ...prev, expiryDate: e.target.value } : prev,
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="total-amount">Total amount</Label>
                  <Input
                    id="total-amount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={activePurchase.totalAmount}
                    autoComplete="off"
                    onChange={(e) =>
                      setActivePurchase((prev) =>
                        prev ? { ...prev, totalAmount: e.target.value } : prev,
                      )
                    }
                    placeholder="0.00"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-calculated from quantity x cost price.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purchase-date">Purchase date</Label>
                  <Input
                    id="purchase-date"
                    type="date"
                    value={activePurchase.purchaseDate}
                    onChange={(e) =>
                      setActivePurchase((prev) =>
                        prev ? { ...prev, purchaseDate: e.target.value } : prev,
                      )
                    }
                    required
                  />
                </div>

                {formMode === "edit" && activePurchase.id ? (
                  <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Editing purchase:{" "}
                    <span className="font-mono">{activePurchase.id}</span>
                  </div>
                ) : null}
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
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !activePurchase ||
                  !activePurchase.supplierId ||
                  !activePurchase.branchId ||
                  !activePurchase.invoiceNumber.trim() ||
                  !activePurchase.purchaseDate ||
                  !activePurchase.totalAmount
                }
                className="rounded-lg"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {formMode === "create" ? "Create purchase" : "Save changes"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
