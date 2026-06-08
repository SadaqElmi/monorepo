import { Injectable } from '@nestjs/common';
import type { ParsedProductImportRow } from './types/import.types';
import { num, parseExcelSheetRows, str } from './import-excel.util';

export const PRODUCT_IMPORT_HEADERS = [
  'item_no',
  'barcode',
  'name',
  'generic_name',
  'strength',
  'formulation',
  'category_path',
  'base_uom',
  'unit',
  'purchase_uom',
  'sales_uom',
  'pos_uom',
  'strip_factor',
  'box_factor',
  'carton_factor',
  'pcs_price',
  'strip_price',
  'box_price',
  'pcs_barcode',
  'strip_barcode',
  'box_barcode',
  'description',
] as const;

export const PRODUCT_IMPORT_REQUIRED_HEADERS = [
  'item_no',
  'name',
  'category_path',
] as const;

const MAX_PRODUCT_ROWS = 100_000;

@Injectable()
export class ImportParserService {
  async parseProductImportBuffer(buffer: Buffer): Promise<{
    rows: Array<{ rowNumber: number; rawData: Record<string, unknown> }>;
    fileSha256: string;
  }> {
    console.log('Required Headers:', PRODUCT_IMPORT_REQUIRED_HEADERS);
    return parseExcelSheetRows(buffer, {
      sheetNames: ['Products'],
      headers: PRODUCT_IMPORT_HEADERS,
      requiredHeaders: PRODUCT_IMPORT_REQUIRED_HEADERS,
      maxRows: MAX_PRODUCT_ROWS,
      importType: 'product',
      debug: true,
      onDebug: ({ rawHeaders, normalizedHeaders }) => {
        console.log('Raw Headers:', rawHeaders);
        console.log('Normalized Headers:', normalizedHeaders);
      },
    });
  }

  parseProductRawRow(
    raw: Record<string, unknown>,
  ): ParsedProductImportRow | null {
    const itemNo = str(raw.item_no);
    const name = str(raw.name);
    if (!itemNo && !name) return null;

    return {
      itemNo: itemNo ?? '',
      barcode: str(raw.barcode),
      name: name ?? '',
      genericName: str(raw.generic_name),
      strength: str(raw.strength),
      formulation: str(raw.formulation),
      categoryPath: str(raw.category_path),
      unit: str(raw.base_uom) ?? str(raw.unit),
      purchaseUom: str(raw.purchase_uom),
      salesUom: str(raw.sales_uom),
      posUom: str(raw.pos_uom),
      stripFactor: num(raw.strip_factor),
      boxFactor: num(raw.box_factor),
      cartonFactor: num(raw.carton_factor),
      pcsPrice: num(raw.pcs_price),
      stripPrice: num(raw.strip_price),
      boxPrice: num(raw.box_price),
      pcsBarcode: str(raw.pcs_barcode),
      stripBarcode: str(raw.strip_barcode),
      boxBarcode: str(raw.box_barcode),
      description: str(raw.description),
    };
  }

  /** @deprecated use parseProductRawRow */
  parseRawRow(raw: Record<string, unknown>): ParsedProductImportRow | null {
    return this.parseProductRawRow(raw);
  }
}
