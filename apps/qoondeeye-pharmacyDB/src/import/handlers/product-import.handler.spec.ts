import { ProductImportHandler } from './product-import.handler';
import type {
  ImportRowValidationResult,
  ParsedProductImportRow,
} from '../types/import.types';

type LookupMaps = {
  productsByItemNo: Map<
    string,
    { id: string; name: string; barcode: string | null }
  >;
  productsByBarcode: Map<
    string,
    { id: string; name: string; itemNo: string | null }
  >;
  duplicateBarcodes: Set<string>;
  categoriesByPath: Map<string, string>;
};

type ValidateRowFn = (
  row: ParsedProductImportRow,
  rowNumber: number,
  lookups: LookupMaps,
  fileIntegrity: {
    itemNoProductFieldValues: Map<string, Map<string, Set<string>>>;
    itemNoRowCounts: Map<string, number>;
    barcodeItemNos: Map<string, Set<string>>;
  },
) => ImportRowValidationResult;

function validateRow(handler: ProductImportHandler): ValidateRowFn {
  return (
    handler as unknown as { validateRow: ValidateRowFn }
  ).validateRow.bind(handler);
}

function emptyLookups(): LookupMaps {
  return {
    productsByItemNo: new Map(),
    productsByBarcode: new Map(),
    duplicateBarcodes: new Set(),
    categoriesByPath: new Map(),
  };
}

function emptyIntegrity(): Parameters<ValidateRowFn>[3] {
  return {
    itemNoProductFieldValues: new Map(),
    itemNoRowCounts: new Map(),
    barcodeItemNos: new Map(),
  };
}

function baseRow(
  overrides: Partial<ParsedProductImportRow> = {},
): ParsedProductImportRow {
  return {
    itemNo: '130001',
    barcode: null,
    name: 'Test Product',
    genericName: null,
    strength: null,
    formulation: null,
    categoryPath: 'Medicine',
    unit: 'tablet',
    description: null,
    ...overrides,
  };
}

describe('ProductImportHandler.validateRow (catalog only)', () => {
  const handler = new ProductImportHandler(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const run = validateRow(handler);

  it('fails when item_no is missing', () => {
    const result = run(
      baseRow({ itemNo: '' }),
      1,
      emptyLookups(),
      emptyIntegrity(),
    );
    expect(result.errors.some((e) => e.code === 'ITEM_NO_REQUIRED')).toBe(true);
  });

  it('fails duplicate item_no in file', () => {
    const result = run(
      baseRow(),
      2,
      emptyLookups(),
      {
        ...emptyIntegrity(),
        itemNoRowCounts: new Map([['130001', 2]]),
      },
    );
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ITEM_NO')).toBe(true);
  });

  it('sets create_product for new item_no', () => {
    const result = run(baseRow(), 1, emptyLookups(), emptyIntegrity());
    expect(result.errors).toHaveLength(0);
    expect(result.action).toBe('create_product');
  });

  it('sets update_product when item_no exists', () => {
    const lookups = emptyLookups();
    lookups.productsByItemNo.set('130001', {
      id: 'prod-1',
      name: 'Existing',
      barcode: null,
    });
    const result = run(baseRow(), 1, lookups, emptyIntegrity());
    expect(result.action).toBe('update_product');
    expect(result.matchedProductId).toBe('prod-1');
  });

  it('rejects invalid UOM conversion factors', () => {
    const result = run(
      baseRow({ stripFactor: 0 }),
      1,
      emptyLookups(),
      emptyIntegrity(),
    );
    expect(result.errors.some((e) => e.code === 'INVALID_UOM_FACTOR')).toBe(
      true,
    );
  });
});
