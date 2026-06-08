import * as ExcelJS from 'exceljs';
import { ImportTemplateService } from './import-template.service';

describe('ImportTemplateService', () => {
  const prisma = {
    withTenantSchema: jest.fn(
      async (_schema: string, cb: (tx: unknown) => unknown) =>
        cb({
          $queryRawUnsafe: jest
            .fn()
            .mockResolvedValue([
              { code: 'MAIN', name: 'Main Branch' },
              { code: 'NORTH', name: 'North Branch' },
            ]),
        }),
    ),
  };

  const service = new ImportTemplateService(prisma as never);

  it('generates Instructions and Products sheets with sample rows', async () => {
    const buffer = await service.generateProductTemplate('tenant_test');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(wb.getWorksheet('Instructions')).toBeDefined();
    const products = wb.getWorksheet('Products');
    expect(products).toBeDefined();

    const dataRows = (products?.rowCount ?? 0) - 1;
    expect(dataRows).toBeGreaterThanOrEqual(1);

    const instructions = wb.getWorksheet('Instructions');
    const instructionText = instructions?.getColumn(1).values
      ?.filter(Boolean)
      .join('\n');
    expect(instructionText).toMatch(/Template type: product_catalog/i);
    expect(instructionText).toMatch(/Template version: 2\.0\.0/i);
    expect(instructionText).toMatch(/does NOT create inventory/i);
  });
});
