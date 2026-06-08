import { Injectable } from '@nestjs/common';
import type { ParsedOpeningStockImportRow } from './types/import.types';
import { parseExcelSheetRows, str, num, dateStr } from './import-excel.util';

export const OPENING_STOCK_IMPORT_HEADERS = [
  'branch_code',
  'item_no',
  'opening_qty',
  'cost_price',
  'batch_number',
  'expiry_date',
  'opening_date',
] as const;

export const OPENING_STOCK_IMPORT_REQUIRED_HEADERS = [
  'branch_code',
  'item_no',
  'opening_qty',
  'cost_price',
  'opening_date',
] as const;

const MAX_ROWS = 50_000;

@Injectable()
export class OpeningStockImportParserService {
  async parseOpeningStockImportBuffer(buffer: Buffer): Promise<{
    rows: Array<{ rowNumber: number; rawData: Record<string, unknown> }>;
    fileSha256: string;
  }> {
    return parseExcelSheetRows(buffer, {
      sheetNames: ['OpeningStock', 'Opening Stock'],
      headers: OPENING_STOCK_IMPORT_HEADERS,
      requiredHeaders: OPENING_STOCK_IMPORT_REQUIRED_HEADERS,
      maxRows: MAX_ROWS,
      importType: 'opening_stock',
      foreignHeaders: [
        'supplier_name',
        'invoice_number',
        'purchase_date',
        'quantity',
        'selling_price',
        'tax_amount',
      ],
    });
  }

  parseRawRow(raw: Record<string, unknown>): ParsedOpeningStockImportRow | null {
    const itemNo = str(raw.item_no);
    const branchCode = str(raw.branch_code);
    if (!itemNo && !branchCode) return null;

    return {
      branchCode: branchCode ?? '',
      itemNo: itemNo ?? '',
      openingQty: Math.max(0, Math.floor(num(raw.opening_qty) ?? 0)),
      costPrice: num(raw.cost_price) ?? 0,
      batchNumber: str(raw.batch_number),
      expiryDate: dateStr(raw.expiry_date),
      openingDate:
        dateStr(raw.opening_date) ?? new Date().toISOString().slice(0, 10),
      listPrice: num(raw.list_price),
    };
  }
}
