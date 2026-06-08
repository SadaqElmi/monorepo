"use client";

import { Edit2 } from "lucide-react";
import { useMemo } from "react";

import type { Category, Product, ProductSupplierLink, ProductUom, Supplier, Uom } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { ProductViewOverviewTab } from "./product-view-overview-tab";
import { ProductViewSuppliersTab } from "./product-view-suppliers-tab";
import { ProductViewUomsTab } from "./product-view-uoms-tab";
import type { ProductUomDraft } from "./products-types";

export type ProductViewSheetProps = {
  open: boolean;
  product: Product | null;
  categoryMap: Map<string, Category>;
  productSuppliers: ProductSupplierLink[];
  productUoms: ProductUom[];
  allUoms: Uom[];
  allSuppliers: Supplier[];
  productUomDraft: ProductUomDraft;
  productUomEditing: Record<string, ProductUomDraft>;
  supplierToAdd: string;
  supplierLinksLoading: boolean;
  supplierLinkSaving: boolean;
  uomSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onDraftChange: (
    updater: (prev: ProductUomDraft) => ProductUomDraft,
  ) => void;
  onEditingChange: (
    updater: (
      prev: Record<string, ProductUomDraft>,
    ) => Record<string, ProductUomDraft>,
  ) => void;
  onAddUom: () => void;
  onSaveUom: (row: ProductUom | null, draft: ProductUomDraft) => void;
  onDisableUom: (row: ProductUom) => void;
  draftFromRow: (row: ProductUom) => ProductUomDraft;
  onSupplierToAddChange: (supplierId: string) => void;
  onAddSupplier: () => void;
  onSetPreferred: (supplierId: string) => void;
  onRemoveSupplier: (supplierId: string) => void;
};

export function ProductViewSheet({
  open,
  product,
  categoryMap,
  productSuppliers,
  productUoms,
  allUoms,
  allSuppliers,
  productUomDraft,
  productUomEditing,
  supplierToAdd,
  supplierLinksLoading,
  supplierLinkSaving,
  uomSaving,
  onOpenChange,
  onClose,
  onEdit,
  onDraftChange,
  onEditingChange,
  onAddUom,
  onSaveUom,
  onDisableUom,
  draftFromRow,
  onSupplierToAddChange,
  onAddSupplier,
  onSetPreferred,
  onRemoveSupplier,
}: ProductViewSheetProps) {
  const baseUomCost = useMemo(() => {
    const baseRow = productUoms.find((row) => row.isBase);
    return baseRow?.costPrice ?? product?.uomCostPrice ?? null;
  }, [productUoms, product?.uomCostPrice]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : onClose())}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Product details</SheetTitle>
          <SheetDescription>
            Quick view of the product metadata.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto p-4">
          {!product ? (
            <div className="text-sm text-muted-foreground">
              No product selected.
            </div>
          ) : (
            <div className="space-y-3">
              <Tabs defaultValue="overview" className="space-y-3">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="uoms">UOM</TabsTrigger>
                  <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3">
                  <ProductViewOverviewTab
                    product={product}
                    categoryMap={categoryMap}
                  />
                </TabsContent>

                <TabsContent value="uoms" className="space-y-3">
                  <ProductViewUomsTab
                    allUoms={allUoms}
                    productUoms={productUoms}
                    baseCost={baseUomCost}
                    productUomDraft={productUomDraft}
                    productUomEditing={productUomEditing}
                    uomSaving={uomSaving}
                    onDraftChange={onDraftChange}
                    onEditingChange={onEditingChange}
                    onAddUom={onAddUom}
                    onSaveUom={onSaveUom}
                    onDisableUom={onDisableUom}
                    draftFromRow={draftFromRow}
                  />
                </TabsContent>

                <TabsContent value="suppliers" className="space-y-3">
                  <ProductViewSuppliersTab
                    productSuppliers={productSuppliers}
                    allSuppliers={allSuppliers}
                    supplierToAdd={supplierToAdd}
                    loading={supplierLinksLoading}
                    saving={supplierLinkSaving}
                    onSupplierToAddChange={onSupplierToAddChange}
                    onAddSupplier={onAddSupplier}
                    onSetPreferred={onSetPreferred}
                    onRemoveSupplier={onRemoveSupplier}
                  />
                </TabsContent>
              </Tabs>

              <div className="pt-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    onClose();
                    onEdit(product);
                  }}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit product
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
