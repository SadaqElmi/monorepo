"use client";

import type { Uom } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { FormUomDraft } from "./products-types";
import {
  buildInitialFormUomByCode,
  formatCalculatedUomCost,
  getEnabledFormUoms,
} from "./products-utils";

export type ProductFormUomSectionProps = {
  allUoms: Uom[];
  formUomByCode: Record<string, FormUomDraft>;
  baseCost: string;
  onToggleEnabled: (code: string, enabled: boolean) => void;
  onPatch: (code: string, patch: Partial<FormUomDraft>) => void;
  onSetBase: (code: string) => void;
};

export function ProductFormUomSection({
  allUoms,
  formUomByCode,
  baseCost,
  onToggleEnabled,
  onPatch,
  onSetBase,
}: ProductFormUomSectionProps) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Units of measure</div>
          <div className="text-xs text-muted-foreground">
            Enable PCS, BOX, STRIP, and other units as needed. Mark one as the
            inventory base (factor = 1).
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {getEnabledFormUoms(formUomByCode).length} active
        </Badge>
      </div>

      {allUoms.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No units configured for this tenant. Add UOMs under Inventory →
          Configuration first.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10" />
                  <TableHead>Unit</TableHead>
                  <TableHead className="w-[88px]">Factor</TableHead>
                  <TableHead className="w-[96px]">Calculated cost</TableHead>
                  <TableHead className="w-[96px]">Sell</TableHead>
                  <TableHead className="w-12 text-center">Base</TableHead>
                  <TableHead className="w-12 text-center">Purch</TableHead>
                  <TableHead className="w-12 text-center">Sales</TableHead>
                  <TableHead className="w-12 text-center">POS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUoms.map((uom) => {
                  const row =
                    formUomByCode[uom.code] ??
                    buildInitialFormUomByCode([uom])[uom.code];

                  return (
                    <TableRow
                      key={uom.id}
                      className={
                        row.enabled
                          ? undefined
                          : "bg-muted/20 text-muted-foreground"
                      }
                    >
                      <TableCell className="align-middle">
                        <Checkbox
                          checked={row.enabled}
                          onCheckedChange={(checked) =>
                            onToggleEnabled(uom.code, checked === true)
                          }
                          aria-label={`Enable ${uom.code}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="font-medium text-foreground">
                          {uom.code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {uom.name}
                          {uom.symbol ? ` · ${uom.symbol}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.conversionFactorToBase}
                          onChange={(e) =>
                            onPatch(uom.code, {
                              conversionFactorToBase: e.target.value,
                            })
                          }
                          disabled={!row.enabled || row.isBase}
                          className="h-8"
                          placeholder="1"
                        />
                      </TableCell>
                      <TableCell className="align-middle text-sm text-muted-foreground">
                        {row.enabled
                          ? formatCalculatedUomCost(
                              baseCost,
                              row.conversionFactorToBase,
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.sellingPrice}
                          onChange={(e) =>
                            onPatch(uom.code, {
                              sellingPrice: e.target.value,
                            })
                          }
                          disabled={!row.enabled}
                          className="h-8"
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        <input
                          type="radio"
                          name="product-base-uom"
                          className="size-4 accent-primary"
                          checked={row.isBase}
                          disabled={!row.enabled}
                          onChange={() => onSetBase(uom.code)}
                          aria-label={`Base unit ${uom.code}`}
                        />
                      </TableCell>
                      {(
                        [
                          "isPurchaseDefault",
                          "isSalesDefault",
                          "isPosDefault",
                        ] as const
                      ).map((key) => (
                        <TableCell
                          key={key}
                          className="align-middle text-center"
                        >
                          <Checkbox
                            checked={row[key]}
                            disabled={!row.enabled}
                            onCheckedChange={(checked) =>
                              onPatch(uom.code, { [key]: checked === true })
                            }
                            aria-label={`${uom.code} ${key}`}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Factor = how many base units are in this unit (e.g. 1 BOX = 10 PCS →
        factor 10). Set the base cost above; other UOM costs are calculated
        automatically.
      </p>
    </div>
  );
}
