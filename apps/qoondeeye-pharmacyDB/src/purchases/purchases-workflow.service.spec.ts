import { PurchasesWorkflowService } from './purchases-workflow.service';

describe('PurchasesWorkflowService UOM conversion', () => {
  it('stores entered purchase quantity with base quantity and base unit cost', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'purchase-1',
          supplier_id: 'supplier-1',
          branch_id: 'branch-1',
          invoice_number: 'INV-1',
          supplier_invoice_no: null,
          purchase_order_no: null,
          total_amount: 50,
          purchase_date: '2026-06-06',
          order_date: null,
          posting_date: '2026-06-06',
          due_date: null,
          status: 'draft',
          notes: null,
          on_credit: true,
          released_at: null,
          received_at: null,
          invoiced_at: null,
          created_at: new Date(),
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const lockDates = {
      assertDocumentDateOpen: jest.fn().mockResolvedValue(undefined),
    };
    const auditLog = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const uomsService = {
      resolveProductUomForDocument: jest.fn().mockResolvedValue({
        productUomId: 'product-box-uom',
        productId: 'product-1',
        uomId: 'box-uom',
        code: 'BOX',
        name: 'Box',
        symbol: 'Box',
        conversionFactorToBase: 100,
        sellingPrice: 10,
        costPrice: null,
      }),
      toBaseQuantity: jest.fn((qty: number, factor: number) => qty * factor),
      toBaseUnitCost: jest.fn((cost: number, factor: number) => cost / factor),
    };

    const service = new PurchasesWorkflowService(
      {} as never,
      {} as never,
      lockDates as never,
      auditLog as never,
      uomsService as never,
    );

    await service.createPurchaseDraftInTx(tx as never, 'branch-1', {
      supplierId: 'supplier-1',
      invoiceNumber: 'INV-1',
      postingDate: '2026-06-06',
      items: [
        {
          productId: 'product-1',
          uomId: 'box-uom',
          quantity: 5,
          costPrice: 10,
          sellingPrice: 10,
          batchNumber: 'B-001',
          expiryDate: '2027-06-30',
        },
      ],
    });

    expect(uomsService.resolveProductUomForDocument).toHaveBeenCalledWith(tx, {
      productId: 'product-1',
      uomId: 'box-uom',
      defaultKind: 'purchase',
    });
    expect(uomsService.toBaseQuantity).toHaveBeenCalledWith(5, 100);
    expect(uomsService.toBaseUnitCost).toHaveBeenCalledWith(10, 100);

    const lineInsertArgs = tx.$queryRawUnsafe.mock.calls[1];
    expect(String(lineInsertArgs[0])).toContain('INSERT INTO purchase_items');
    expect(lineInsertArgs.slice(1, 9)).toEqual([
      'purchase-1',
      'branch-1',
      'product-1',
      'box-uom',
      5,
      100,
      500,
      0.1,
    ]);
    expect(lineInsertArgs[11]).toBe(false);
    expect(
      tx.$queryRawUnsafe.mock.calls.some((call) =>
        String(call[0]).includes('product_uom_prices'),
      ),
    ).toBe(false);
  });

  it('promotes supplier UOM cost history and optional selling price on invoice post', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const uomsService = {
      upsertSellingPriceInTx: jest.fn().mockResolvedValue(undefined),
      upsertBaseCostInTx: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PurchasesWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      uomsService as never,
    );

    await service.promotePurchasePricingOnInvoicePostInTx(
      tx as never,
      'purchase-1',
      { actorUserId: 'actor-1' },
    );

    const sql = tx.$queryRawUnsafe.mock.calls
      .map((call) => String(call[0]))
      .join('\n');
    expect(sql).toContain('product_supplier_uom_costs');
    expect(sql).toContain('supplier_price_history');
    expect(sql).toContain('product_uom_prices');
    expect(sql).toContain('product_price_group_prices');
    expect(sql).toContain('pi.update_selling_price IS TRUE');
    expect(sql).toContain('base_uom_id');
    expect(sql).toContain('base_unit_cost');
    expect(uomsService.upsertSellingPriceInTx).not.toHaveBeenCalled();
    expect(uomsService.upsertBaseCostInTx).not.toHaveBeenCalled();
  });
});
