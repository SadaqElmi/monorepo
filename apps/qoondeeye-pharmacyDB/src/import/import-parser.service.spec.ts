import { ImportParserService } from './import-parser.service';
import * as ExcelJS from 'exceljs';

async function buildProductWorkbook(headers: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Products');
  sheet.addRow(headers);
  sheet.addRow(['130001', '6281001', 'Paracetamol', 'Medicine', 'tablet']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('ImportParserService', () => {
  const parser = new ImportParserService();

  describe('parseProductImportBuffer', () => {
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
      const result = await parser.parseProductImportBuffer(buffer);
      expect(result.rows).toHaveLength(1);
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
      const result = await parser.parseProductImportBuffer(buffer);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.rawData.category_path).toBe('Medicine');
    });
  });

  describe('parseProductRawRow', () => {
    it('parses catalog fields', () => {
      const row = parser.parseProductRawRow({
        item_no: '130001',
        name: 'Paracetamol',
        strength: '500mg',
        formulation: 'Tablet',
        description: 'Pain relief',
      });
      expect(row).toMatchObject({
        itemNo: '130001',
        name: 'Paracetamol',
        strength: '500mg',
        formulation: 'Tablet',
        description: 'Pain relief',
      });
    });

    it('returns null for empty rows', () => {
      expect(parser.parseProductRawRow({})).toBeNull();
    });
  });
});
