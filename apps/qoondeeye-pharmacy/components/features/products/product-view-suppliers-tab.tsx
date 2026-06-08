"use client";

import { Loader2 } from "lucide-react";

import type { ProductSupplierLink, Supplier } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProductViewSuppliersTabProps = {
  productSuppliers: ProductSupplierLink[];
  allSuppliers: Supplier[];
  supplierToAdd: string;
  loading: boolean;
  saving: boolean;
  onSupplierToAddChange: (supplierId: string) => void;
  onAddSupplier: () => void;
  onSetPreferred: (supplierId: string) => void;
  onRemoveSupplier: (supplierId: string) => void;
};

export function ProductViewSuppliersTab({
  productSuppliers,
  allSuppliers,
  supplierToAdd,
  loading,
  saving,
  onSupplierToAddChange,
  onAddSupplier,
  onSetPreferred,
  onRemoveSupplier,
}: ProductViewSuppliersTabProps) {
  const availableSuppliers = allSuppliers.filter(
    (supplier) =>
      !productSuppliers.some((link) => link.supplierId === supplier.id),
  );

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Suppliers
          </div>
          <div className="text-sm font-semibold">
            {productSuppliers.length.toLocaleString()} linked
          </div>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="space-y-2">
        {productSuppliers.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No linked suppliers.
          </div>
        ) : (
          productSuppliers.map((link) => (
            <div
              key={link.supplierId}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {link.supplierName ?? "Unnamed supplier"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {link.supplierType === "international"
                    ? "International"
                    : "Local"}
                  {link.lastCostPrice != null
                    ? ` - Last cost ${link.lastCostPrice}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {link.isPreferred ? (
                  <Badge variant="secondary">Preferred</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSetPreferred(link.supplierId)}
                    disabled={saving}
                  >
                    Prefer
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveSupplier(link.supplierId)}
                  disabled={saving}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <Select
          value={supplierToAdd || "__none__"}
          onValueChange={(value) =>
            onSupplierToAddChange(value === "__none__" ? "" : value)
          }
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue placeholder="Add supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select supplier</SelectItem>
            {availableSuppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name ?? "Unnamed supplier"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={onAddSupplier}
          disabled={!supplierToAdd || saving}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
