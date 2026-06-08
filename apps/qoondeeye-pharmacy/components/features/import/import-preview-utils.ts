import type { ImportJobRow } from "@/lib/services/imports";

export type ImportWizardColumn = {
  field: string;
  label: string;
};

export const PRODUCT_IMPORT_COLUMNS: ImportWizardColumn[] = [
  { field: "item_no", label: "Item No" },
  { field: "barcode", label: "Barcode" },
  { field: "name", label: "Name" },
  { field: "generic_name", label: "Generic name" },
  { field: "strength", label: "Strength" },
  { field: "formulation", label: "Formulation" },
  { field: "category_path", label: "Category" },
  { field: "base_uom", label: "Base UOM" },
  { field: "unit", label: "Unit (legacy)" },
  { field: "purchase_uom", label: "Purchase UOM" },
  { field: "sales_uom", label: "Sales UOM" },
  { field: "pos_uom", label: "POS UOM" },
  { field: "strip_factor", label: "Strip factor" },
  { field: "box_factor", label: "Box factor" },
  { field: "carton_factor", label: "Carton factor" },
  { field: "pcs_price", label: "PCS price" },
  { field: "strip_price", label: "Strip price" },
  { field: "box_price", label: "Box price" },
  { field: "pcs_barcode", label: "PCS barcode" },
  { field: "strip_barcode", label: "Strip barcode" },
  { field: "box_barcode", label: "Box barcode" },
  { field: "description", label: "Description" },
];

export const PRODUCT_IMPORT_DETAIL_COLUMNS: ImportWizardColumn[] = [
  { field: "item_no", label: "Item no" },
  { field: "name", label: "Name" },
  { field: "base_uom", label: "Base UOM" },
  { field: "purchase_uom", label: "Purchase UOM" },
  { field: "sales_uom", label: "Sales UOM" },
  { field: "pos_uom", label: "POS UOM" },
];

const DATE_FIELDS = new Set(["expiry_date", "opening_date"]);
const MONEY_FIELDS = new Set([
  "list_price",
  "cost_price",
  "pcs_price",
  "strip_price",
  "box_price",
]);
const NUMBER_FIELDS = new Set([
  "list_price",
  "opening_qty",
  "cost_price",
  "reorder_level",
  "strip_factor",
  "box_factor",
  "carton_factor",
]);

/** Maps preview column (raw header) to parsedData camelCase key. */
const PARSED_FIELD_BY_RAW: Record<string, string> = {
  item_no: "itemNo",
  barcode: "barcode",
  name: "name",
  generic_name: "genericName",
  strength: "strength",
  formulation: "formulation",
  category_path: "categoryPath",
  base_uom: "unit",
  unit: "unit",
  purchase_uom: "purchaseUom",
  sales_uom: "salesUom",
  pos_uom: "posUom",
  strip_factor: "stripFactor",
  box_factor: "boxFactor",
  carton_factor: "cartonFactor",
  pcs_price: "pcsPrice",
  strip_price: "stripPrice",
  box_price: "boxPrice",
  pcs_barcode: "pcsBarcode",
  strip_barcode: "stripBarcode",
  box_barcode: "boxBarcode",
  description: "description",
  list_price: "listPrice",
  branch_code: "branchCode",
  opening_qty: "openingQty",
  cost_price: "costPrice",
  batch_number: "batchNumber",
  expiry_date: "expiryDate",
  reorder_level: "reorderLevel",
  opening_date: "openingDate",
};

function rawFieldValue(
  rawData: Record<string, unknown>,
  field: string,
): unknown {
  return rawData[field];
}

export function rawRowsSignature(rows: ImportJobRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      rawData: row.rawData,
    })),
  );
}

export function cellValue(row: ImportJobRow, field: string): string {
  const rawValue = rawFieldValue(row.rawData, field);
  if (rawValue != null && rawValue !== "") return String(rawValue);
  const parsedField = PARSED_FIELD_BY_RAW[field];
  const parsedValue = parsedField
    ? row.parsedData?.[parsedField]
    : row.parsedData?.[field];
  if (parsedValue == null || parsedValue === "") return "";
  return String(parsedValue);
}

export function normalizeEditValue(field: string, value: string): string {
  const trimmed = value.trim();
  if (DATE_FIELDS.has(field) && !trimmed) return "";
  if (NUMBER_FIELDS.has(field) && !trimmed) return "";
  return trimmed;
}

export function formatCellValue(field: string, value: string): string {
  if (!value) return "-";
  if (MONEY_FIELDS.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : value;
  }
  if (
    field === "opening_qty" ||
    field === "reorder_level" ||
    field === "strip_factor" ||
    field === "box_factor" ||
    field === "carton_factor"
  ) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : value;
  }
  return value;
}

export function inputTypeForField(field: string): {
  type: "text" | "number" | "date";
  step?: string;
} {
  if (DATE_FIELDS.has(field)) return { type: "date" };
  if (MONEY_FIELDS.has(field)) return { type: "number", step: "0.01" };
  if (NUMBER_FIELDS.has(field)) return { type: "number", step: "1" };
  return { type: "text" };
}
