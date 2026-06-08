import { ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService.remove', () => {
  const tenantService = { applyTenantSchemaPatches: jest.fn() };
  const taggedCache = { getOrSet: jest.fn() };
  const cacheInvalidation = { invalidateCatalogForBranches: jest.fn() };
  const uomsService = {
    ensureBaseUomForProductInTx: jest.fn(),
    upsertProductUomByCodeInTx: jest.fn(),
    syncProductListPriceFromBaseUomInTx: jest.fn(),
  };
  const tx = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
  const prisma = {
    withTenantSchema: jest.fn(async (_schema: string, cb: (t: typeof tx) => unknown) =>
      cb(tx),
    ),
  };

  const service = new ProductsService(
    prisma as never,
    tenantService as never,
    taggedCache as never,
    cacheInvalidation as never,
    uomsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tenantService.applyTenantSchemaPatches.mockResolvedValue(undefined);
    tx.$executeRawUnsafe.mockResolvedValue(1);
    uomsService.ensureBaseUomForProductInTx.mockResolvedValue({});
    uomsService.upsertProductUomByCodeInTx.mockResolvedValue({});
    uomsService.syncProductListPriceFromBaseUomInTx.mockResolvedValue(undefined);
  });

  it('stores create sku only on products.barcode and does not create UOM barcodes', async () => {
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'product-2',
          branchId: null,
          itemNo: null,
          name: 'P-Scanner',
          genericName: null,
          sku: '21222',
          listPrice: 20,
          categoryId: null,
          supplierId: null,
          strength: null,
          formulation: null,
          unit: 'PCS',
          description: null,
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    await service.create('tenant_a', 'tenant-id', {
      name: 'P-Scanner',
      sku: '21222',
      unit: 'PCS',
      uoms: [
        {
          code: 'PCS',
          conversionFactorToBase: 1,
          costPrice: 15,
          sellingPrice: 20,
        },
      ],
    });

    expect(uomsService.ensureBaseUomForProductInTx).toHaveBeenCalledWith(
      tx,
      'product-2',
      'PCS',
      { listPrice: undefined },
    );
    expect(uomsService.upsertProductUomByCodeInTx).toHaveBeenCalledWith(
      tx,
      'product-2',
      expect.objectContaining({
        code: 'PCS',
        factor: 1,
        isBase: true,
        isPurchaseDefault: true,
        isSalesDefault: true,
        isPosDefault: true,
        costPrice: 15,
        sellingPrice: 20,
      }),
    );
    expect(
      uomsService.upsertProductUomByCodeInTx.mock.calls[0]?.[2],
    ).not.toHaveProperty('barcode');
  });

  it('returns a clear conflict when import-created stock blocks deletion', async () => {
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'product-1',
          branchId: null,
          itemNo: 'QA-1',
          name: 'QA Product 1',
          genericName: null,
          sku: '6281001',
          listPrice: 1,
          categoryId: null,
          strength: null,
          formulation: null,
          unit: 'pcs',
          description: null,
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          sale_count: 0,
          sale_return_count: 0,
          purchase_count: 0,
          transfer_count: 0,
          opening_stock_count: 1,
          inventory_qty: 0,
          batch_qty: 0,
        },
      ]);

    try {
      await service.remove('tenant_a', 'tenant-id', 'product-1', ['branch-1']);
      throw new Error('Expected remove to fail');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toMatchObject({
        error: 'PRODUCT_DELETE_BLOCKED',
      });
    }
  });
});
