"use client";

import { Loader2, Plus } from "lucide-react";

import type { ProductUom, Uom } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ProductUomDraft } from "./products-types";
import { formatCalculatedUomCost } from "./products-utils";

export type ProductViewUomsTabProps = {
  allUoms: Uom[];
  productUoms: ProductUom[];
  baseCost: number | string | null | undefined;
  productUomDraft: ProductUomDraft;
  productUomEditing: Record<string, ProductUomDraft>;
  uomSaving: boolean;
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
};

export function ProductViewUomsTab({
  allUoms,
  productUoms,
  baseCost,
  productUomDraft,
  productUomEditing,
  uomSaving,
  onDraftChange,
  onEditingChange,
  onAddUom,
  onSaveUom,
  onDisableUom,
  draftFromRow,
}: ProductViewUomsTabProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-lg border p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>UOM</Label>
            <Select
              value={productUomDraft.uomId || "__none__"}
              onValueChange={(value) =>
                onDraftChange((prev) => ({
                  ...prev,
                  uomId: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select UOM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select UOM</SelectItem>
                {allUoms.map((uom) => (
                  <SelectItem key={uom.id} value={uom.id}>
                    {uom.code} - {uom.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Factor to base</Label>
            <Input
              value={productUomDraft.conversionFactorToBase}
              onChange={(e) =>
                onDraftChange((prev) => ({
                  ...prev,
                  conversionFactorToBase: e.target.value,
                }))
              }
              disabled={productUomDraft.isBase}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Calculated cost</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
              {formatCalculatedUomCost(
                baseCost,
                productUomDraft.conversionFactorToBase,
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Selling price</Label>
            <Input
              value={productUomDraft.sellingPrice}
              onChange={(e) =>
                onDraftChange((prev) => ({
                  ...prev,
                  sellingPrice: e.target.value,
                }))
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 text-xs">
            {(
              [
                ["isBase", "Base"],
                ["isPurchaseDefault", "Purchase"],
                ["isSalesDefault", "Sales"],
                ["isPosDefault", "POS"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={productUomDraft[key]}
                  onChange={(e) =>
                    onDraftChange((prev) => ({
                      ...prev,
                      [key]: e.target.checked,
                      conversionFactorToBase:
                        key === "isBase" && e.target.checked
                          ? "1"
                          : prev.conversionFactorToBase,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            size="sm"
            onClick={onAddUom}
            disabled={uomSaving || !productUomDraft.uomId}
          >
            {uomSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Add UOM
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>UOM</TableHead>
              <TableHead>Factor</TableHead>
              <TableHead>Defaults</TableHead>
              <TableHead>Calculated cost</TableHead>
              <TableHead>Selling price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productUoms.map((uom) => {
              const edit = productUomEditing[uom.id] ?? draftFromRow(uom);
              const isEditing = Boolean(productUomEditing[uom.id]);

              return (
                <TableRow key={uom.id}>
                  <TableCell>
                    <div className="font-medium">{uom.symbol || uom.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {uom.name}
                    </div>
                    {!uom.isActive ? (
                      <Badge variant="secondary">Disabled</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        className="w-20"
                        value={edit.conversionFactorToBase}
                        disabled={edit.isBase}
                        onChange={(e) =>
                          onEditingChange((prev) => ({
                            ...prev,
                            [uom.id]: {
                              ...edit,
                              conversionFactorToBase: e.target.value,
                            },
                          }))
                        }
                      />
                    ) : (
                      Number(uom.conversionFactorToBase).toLocaleString()
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="grid gap-1 text-xs">
                        {(
                          [
                            ["isBase", "Base"],
                            ["isPurchaseDefault", "Purchase"],
                            ["isSalesDefault", "Sales"],
                            ["isPosDefault", "POS"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={edit[key]}
                              onChange={(e) =>
                                onEditingChange((prev) => ({
                                  ...prev,
                                  [uom.id]: {
                                    ...edit,
                                    [key]: e.target.checked,
                                    conversionFactorToBase:
                                      key === "isBase" && e.target.checked
                                        ? "1"
                                        : edit.conversionFactorToBase,
                                  },
                                }))
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {uom.isBase ? <Badge>Base</Badge> : null}
                        {uom.isPurchaseDefault ? (
                          <Badge variant="secondary">Purchase</Badge>
                        ) : null}
                        {uom.isSalesDefault ? (
                          <Badge variant="secondary">Sales</Badge>
                        ) : null}
                        {uom.isPosDefault ? (
                          <Badge variant="secondary">POS</Badge>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatCalculatedUomCost(
                      baseCost ?? uom.costPrice,
                      isEditing
                        ? edit.conversionFactorToBase
                        : uom.conversionFactorToBase,
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        className="w-20"
                        value={edit.sellingPrice}
                        onChange={(e) =>
                          onEditingChange((prev) => ({
                            ...prev,
                            [uom.id]: {
                              ...edit,
                              sellingPrice: e.target.value,
                            },
                          }))
                        }
                      />
                    ) : (
                      (uom.sellingPrice ?? "—")
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {isEditing ? (
                      <Button
                        size="sm"
                        onClick={() => onSaveUom(uom, edit)}
                        disabled={uomSaving}
                      >
                        Save
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onEditingChange((prev) => ({
                            ...prev,
                            [uom.id]: edit,
                          }))
                        }
                      >
                        Edit
                      </Button>
                    )}
                    {uom.isActive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDisableUom(uom)}
                        disabled={uomSaving || uom.isBase}
                      >
                        Disable
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {productUoms.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No UOM rows.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
