"use client";

import { Loader2 } from "lucide-react";

import type { Category, Uom } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { ProductFormUomSection } from "./product-form-uom-section";
import type { EditableProduct, FormMode, FormUomDraft } from "./products-types";

export type ProductFormSheetProps = {
  open: boolean;
  mode: FormMode;
  product: EditableProduct | null;
  categories: Category[];
  allUoms: Uom[];
  formUomByCode: Record<string, FormUomDraft>;
  formNotice: string | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFieldChange: (field: keyof EditableProduct, value: string) => void;
  onToggleFormUomEnabled: (code: string, enabled: boolean) => void;
  onPatchFormUom: (code: string, patch: Partial<FormUomDraft>) => void;
  onSetFormUomBase: (code: string) => void;
};

export function ProductFormSheet({
  open,
  mode,
  product,
  categories,
  allUoms,
  formUomByCode,
  formNotice,
  saving,
  onOpenChange,
  onClose,
  onSubmit,
  onFieldChange,
  onToggleFormUomEnabled,
  onPatchFormUom,
  onSetFormUomBase,
}: ProductFormSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
        else onOpenChange(true);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader className="border-b">
            <SheetTitle>
              {mode === "create" ? "New product" : "Edit product"}
            </SheetTitle>
            <SheetDescription>
              Add key details like name, barcode, strength, and category.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {formNotice ? (
              <Alert className="border-primary/30 bg-primary/5">
                <AlertTitle>Existing product found</AlertTitle>
                <AlertDescription>{formNotice}</AlertDescription>
              </Alert>
            ) : null}

            {!product ? (
              <div className="text-sm text-muted-foreground">
                Select a product to edit.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="prod-name">Product name</Label>
                  <Input
                    id="prod-name"
                    value={product.name}
                    onChange={(e) => onFieldChange("name", e.target.value)}
                    required
                    placeholder="e.g. Amoxicillin"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prod-sku">Barcode / SKU (optional)</Label>
                  <Input
                    id="prod-sku"
                    value={product.sku}
                    onChange={(e) => onFieldChange("sku", e.target.value)}
                    placeholder="Scan or type barcode"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={product.categoryId || "__none__"}
                    onValueChange={(v) =>
                      onFieldChange("categoryId", v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prod-strength">Strength</Label>
                  <Input
                    id="prod-strength"
                    value={product.strength}
                    onChange={(e) => onFieldChange("strength", e.target.value)}
                    placeholder="500mg"
                  />
                </div>

                {mode === "create" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="prod-reorder">Reorder level</Label>
                    <Input
                      id="prod-reorder"
                      value={product.reorderLevel}
                      onChange={(e) =>
                        onFieldChange("reorderLevel", e.target.value)
                      }
                      inputMode="numeric"
                      placeholder="10"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum quantity before the item is flagged as low stock.
                      Applied to all branches.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prod-cost">Base cost (per base UOM)</Label>
                    <Input
                      id="prod-cost"
                      value={product.costPrice}
                      onChange={(e) =>
                        onFieldChange("costPrice", e.target.value)
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Other UOM costs are calculated from this value and each
                      unit&apos;s conversion factor.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prod-selling">Selling price</Label>
                    <Input
                      id="prod-selling"
                      value={product.sellingPrice}
                      onChange={(e) =>
                        onFieldChange("sellingPrice", e.target.value)
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {mode === "edit" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="prod-unit">Unit</Label>
                    <Input
                      id="prod-unit"
                      value={product.unit}
                      onChange={(e) => onFieldChange("unit", e.target.value)}
                      placeholder="PCS, tablet, ml"
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="prod-formulation">Form (optional)</Label>
                  <Input
                    id="prod-formulation"
                    value={product.formulation}
                    onChange={(e) =>
                      onFieldChange("formulation", e.target.value)
                    }
                    placeholder="Capsule, Suspension, Syrup"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prod-desc">Description (optional)</Label>
                  <Input
                    id="prod-desc"
                    value={product.description}
                    onChange={(e) =>
                      onFieldChange("description", e.target.value)
                    }
                    placeholder="Brief notes to help staff"
                  />
                </div>

                {mode === "create" ? (
                  <ProductFormUomSection
                    allUoms={allUoms}
                    formUomByCode={formUomByCode}
                    baseCost={product.costPrice}
                    onToggleEnabled={onToggleFormUomEnabled}
                    onPatch={onPatchFormUom}
                    onSetBase={onSetFormUomBase}
                  />
                ) : null}
              </>
            )}
          </div>

          <SheetFooter className="border-t">
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !product}>
                {saving && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {mode === "create" ? "Create product" : "Save changes"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
