import { NotFoundException } from '@nestjs/common';
import { PosReceiptsService } from './pos-receipts.service';

describe('PosReceiptsService', () => {
  const schemaName = 'hayat';
  const saleId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const branchIds = ['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'];

  it('formats receipt from sale record', async () => {
    const sale = {
      id: saleId,
      receipt_number: 'R-42',
      sale_date: '2026-06-11',
      total_amount: 99.5,
      discount: 0,
      tax: 5,
      payment_method: 'cash',
      customer_name: 'Walk-in',
      items: [{ productId: 'p1', quantity: 1 }],
    };
    const salesService = {
      findOne: jest.fn().mockResolvedValue(sale),
    };
    const prisma = {
      withTenantSchema: jest.fn(),
    };
    const service = new PosReceiptsService(prisma as never, salesService as never);

    const receipt = await service.getReceipt(schemaName, saleId, branchIds);

    expect(receipt).toEqual({
      saleId,
      receiptNumber: 'R-42',
      saleDate: '2026-06-11',
      totalAmount: 99.5,
      discount: 0,
      tax: 5,
      paymentMethod: 'cash',
      customerName: 'Walk-in',
      items: [{ productId: 'p1', quantity: 1 }],
    });
  });

  it('throws when sale is not found', async () => {
    const salesService = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new PosReceiptsService({} as never, salesService as never);

    await expect(
      service.getReceipt(schemaName, saleId, branchIds),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records reprint audit event', async () => {
    const queryRaw = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      withTenantSchema: jest.fn(
        async (
          _schema: string,
          cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
        ) => cb({ $queryRawUnsafe: queryRaw }),
      ),
    };
    const service = new PosReceiptsService(prisma as never, {} as never);

    const result = await service.recordReprint(
      schemaName,
      saleId,
      branchIds[0],
      'user-1',
    );

    expect(result).toEqual({ ok: true });
    expect(queryRaw).toHaveBeenCalledWith(
      expect.stringContaining('pos_receipt_events'),
      saleId,
      branchIds[0],
      'user-1',
    );
  });
});
