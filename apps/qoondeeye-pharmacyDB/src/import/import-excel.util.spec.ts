import * as ExcelJS from 'exceljs';
import {
  normalizeHeaderKey,
  parseExcelSheetRows,
} from './import-excel.util';
import {
  PRODUCT_IMPORT_HEADERS,
  PRODUCT_IMPORT_REQUIRED_HEADERS,
} from './import-parser.service';

async function buildProductWorkbook(
  headers: string[],
  dataRow?: Array<string | number>,
  options?: { sheetName?: string; headerRow?: number; extraSheets?: Array<{ name: string; headers: string[] }> },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const extra of options?.extraSheets ?? []) {
    const sheet = wb.addWorksheet(extra.name);
    sheet.addRow(extra.headers);
  }

  const sheetName = options?.sheetName ?? 'Products';
  const sheet = wb.addWorksheet(sheetName);
  const headerRow = options?.headerRow ?? 1;
  for (let rowNumber = 1; rowNumber < headerRow; rowNumber++) {
    sheet.addRow([]);
  }
  sheet.addRow(headers);
  if (dataRow) {
    sheet.addRow(dataRow);
  } else {
    sheet.addRow(['130001', '6281001', 'Paracetamol', 'Medicine', 'tablet']);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('normalizeHeaderKey', () => {
  it.each([
    ['item_no', 'item_no'],
    ['Item No', 'item_no'],
    ['ITEM_NO', 'item_no'],
    [' item_no ', 'item_no'],
    ['Item_No', 'item_no'],
    ['Category Path', 'category_path'],
    ['CATEGORY_PATH', 'category_path'],
    [' category_path ', 'category_path'],
    ['NAME', 'name'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeHeaderKey(input)).toBe(expected);
  });
});

describe('parseExcelSheetRows product headers', () => {
  const parseOptions = {
    sheetNames: ['Products'],
    headers: PRODUCT_IMPORT_HEADERS,
    requiredHeaders: PRODUCT_IMPORT_REQUIRED_HEADERS,
    maxRows: 1000,
    importType: 'product' as const,
  };

  it.each([
    ['item_no'],
    ['Item No'],
    ['ITEM_NO'],
    [' item_no '],
    ['Item_No'],
  ])('accepts item_no header variation %j', async (itemNoHeader) => {
    const buffer = await buildProductWorkbook([
      itemNoHeader,
      'barcode',
      'name',
      'category_path',
      'unit',
    ]);
    const result = await parseExcelSheetRows(buffer, parseOptions);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rawData.item_no).toBe('130001');
  });

  it.each([
    ['category_path'],
    ['Category Path'],
    ['CATEGORY_PATH'],
    [' category_path '],
  ])('accepts category_path header variation %j', async (categoryHeader) => {
    const buffer = await buildProductWorkbook([
      'item_no',
      'barcode',
      'name',
      categoryHeader,
      'unit',
    ]);
    const result = await parseExcelSheetRows(buffer, parseOptions);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rawData.category_path).toBe('Medicine');
  });

  it('selects the sheet that contains headers when Products sheet is empty', async () => {
    const buffer = await buildProductWorkbook(
      ['item_no', 'barcode', 'name', 'category_path', 'unit'],
      undefined,
      {
        extraSheets: [{ name: 'Products', headers: [] }],
        sheetName: 'Catalog',
      },
    );
    const result = await parseExcelSheetRows(buffer, parseOptions);
    expect(result.rows).toHaveLength(1);
  });

  it('finds headers below a title row', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Products');
    sheet.addRow(['Product catalog import']);
    sheet.addRow(['item_no', 'name', 'category_path', 'unit']);
    sheet.addRow(['130001', 'Paracetamol', 'Medicine', 'tablet']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await parseExcelSheetRows(buffer, parseOptions);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rawData.name).toBe('Paracetamol');
  });

  it('reports expected and found headers on validation failure', async () => {
    const buffer = await buildProductWorkbook([
      'Item No',
      'Barcode',
      'Product Name',
    ]);

    await expect(parseExcelSheetRows(buffer, parseOptions)).rejects.toThrow(
      /Expected:/,
    );
    await expect(parseExcelSheetRows(buffer, parseOptions)).rejects.toThrow(
      /Found:\s*Item No, Barcode, Product Name/,
    );
  });

  it('accepts CSV content saved with an .xlsx extension', async () => {
    const csv = [
      'item_no,barcode,name,category_path,unit',
      '130001,6281001,Paracetamol,Medicine,tablet',
    ].join('\n');
    const result = await parseExcelSheetRows(Buffer.from(csv, 'utf8'), parseOptions);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rawData.item_no).toBe('130001');
  });
});
