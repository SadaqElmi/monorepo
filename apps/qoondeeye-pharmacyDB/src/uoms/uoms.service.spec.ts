import { BadRequestException } from '@nestjs/common';
import { UomsService } from './uoms.service';
import { formatBaseQuantityDisplay } from './uom-display.util';

describe('UomsService conversion math', () => {
  const service = new UomsService({} as never, {} as never);

  it('converts document quantities to integer base UOM quantities', () => {
    expect(service.toBaseQuantity(5, 100)).toBe(500);
    expect(service.toBaseQuantity(1, 10)).toBe(10);
    expect(service.toBaseUnitCost(10, 100)).toBe(0.1);
    expect(service.fromBaseUnitCost(0.05, 10)).toBe(0.5);
    expect(service.fromBaseUnitCost(0.05, 100)).toBe(5);
  });

  it('round-trips base and document UOM costs', () => {
    const baseCost = 0.05;
    const factor = 100;
    const documentCost = service.fromBaseUnitCost(baseCost, factor);
    expect(service.toBaseUnitCost(documentCost, factor)).toBe(baseCost);
  });

  it('rejects fractional base quantities while stock remains integer-based', () => {
    expect(() => service.toBaseQuantity(1, 2.5)).toThrow(BadRequestException);
  });
});

describe('UomsService barcode upsert', () => {
  const service = new UomsService({} as never, {} as never) as unknown as {
    upsertBarcodeInTx: (
      tx: {
        $queryRawUnsafe: jest.Mock;
        $executeRawUnsafe: jest.Mock;
      },
      productId: string,
      uomId: string,
      barcode?: string | null,
    ) => Promise<void>;
  };

  it('reactivates the same product/UOM barcode row by id instead of inserting a duplicate', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ schemaName: 'tenant_a' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { recordId: 'barcode-row-1', productName: 'New Product' },
      ])
      .mockResolvedValueOnce([]);

    await service.upsertBarcodeInTx(tx, 'product-1', 'uom-1', '12345');

    const queries = tx.$queryRawUnsafe.mock.calls.map(([query]) => String(query));
    expect(
      queries.some((query) =>
        query.includes('INSERT INTO product_uom_barcodes'),
      ),
    ).toBe(false);
    expect(
      queries.some((query) => query.includes('WHERE id = $2::uuid')),
    ).toBe(true);
  });
});

describe('formatBaseQuantityDisplay', () => {
  it('renders base stock using largest active conversions first', () => {
    expect(
      formatBaseQuantityDisplay(485, [
        {
          code: 'PCS',
          symbol: 'PCS',
          conversionFactorToBase: 1,
          isBase: true,
          isActive: true,
        },
        {
          code: 'STRIP',
          symbol: 'Strip',
          conversionFactorToBase: 10,
          isActive: true,
        },
        {
          code: 'BOX',
          symbol: 'Box',
          conversionFactorToBase: 100,
          isActive: true,
        },
      ]),
    ).toBe('4 Box 8 Strip 5 PCS');
  });
});
