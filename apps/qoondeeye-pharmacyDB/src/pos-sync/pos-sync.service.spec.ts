import { BadRequestException, ConflictException } from '@nestjs/common';
import { PosSyncService } from './pos-sync.service';
import { SalesService } from '../sales/sales.service';
import { PosCashDrawerService } from '../pos-cash-drawer/pos-cash-drawer.service';

describe('PosSyncService', () => {
  const schemaName = 'hayat';
  const branchId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const clientSaleRef = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const productId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const sessionId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  let salesService: jest.Mocked<Pick<SalesService, 'findByClientSaleRef' | 'create'>>;
  let cashDrawerService: jest.Mocked<Pick<PosCashDrawerService, 'createMovement'>>;
  let service: PosSyncService;

  beforeEach(() => {
    salesService = {
      findByClientSaleRef: jest.fn(),
      create: jest.fn(),
    };
    cashDrawerService = {
      createMovement: jest.fn(),
    };
    service = new PosSyncService(
      salesService as unknown as SalesService,
      cashDrawerService as unknown as PosCashDrawerService,
    );
  });

  it('requires branch id', async () => {
    await expect(
      service.batchSync(schemaName, '', [], {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks blank clientSaleRef as conflict without calling create', async () => {
    const result = await service.batchSync(
      schemaName,
      branchId,
      [{ clientSaleRef: '   ', sale: { items: [{ productId, quantity: 1 }] } }],
      {},
    );

    expect(result.results).toEqual([
      {
        clientSaleRef: '   ',
        status: 'conflict',
        message: 'clientSaleRef is required',
      },
    ]);
    expect(salesService.create).not.toHaveBeenCalled();
  });

  it('accepts a new offline sale', async () => {
    salesService.findByClientSaleRef.mockResolvedValue(null);
    salesService.create.mockResolvedValue({
      id: 'sale-1',
      receipt_number: 'R-100',
    } as never);

    const result = await service.batchSync(
      schemaName,
      branchId,
      [
        {
          clientSaleRef,
          sale: { items: [{ productId, quantity: 1, price: 10 }] },
        },
      ],
      { actorUserId: 'user-1' },
    );

    expect(salesService.create).toHaveBeenCalledWith(
      schemaName,
      branchId,
      expect.objectContaining({
        clientSaleRef,
        syncSource: 'offline',
        items: [{ productId, quantity: 1, price: 10 }],
      }),
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
    expect(result.results[0]).toEqual({
      clientSaleRef,
      status: 'accepted',
      saleId: 'sale-1',
      receiptNumber: 'R-100',
    });
  });

  it('marks duplicate when sale existed before create', async () => {
    salesService.findByClientSaleRef.mockResolvedValue({ id: 'existing' } as never);
    salesService.create.mockResolvedValue({
      id: 'sale-1',
      receipt_number: 'R-100',
    } as never);

    const result = await service.batchSync(
      schemaName,
      branchId,
      [{ clientSaleRef, sale: { items: [{ productId, quantity: 1 }] } }],
      {},
    );

    expect(result.results[0].status).toBe('duplicate');
  });

  it('treats ConflictException as duplicate', async () => {
    salesService.findByClientSaleRef.mockResolvedValue(null);
    salesService.create.mockRejectedValue(
      new ConflictException('client_sale_ref already exists'),
    );

    const result = await service.batchSync(
      schemaName,
      branchId,
      [{ clientSaleRef, sale: { items: [{ productId, quantity: 1 }] } }],
      {},
    );

    expect(result.results[0]).toMatchObject({
      clientSaleRef,
      status: 'duplicate',
    });
  });

  it('treats insufficient stock as conflict', async () => {
    salesService.findByClientSaleRef.mockResolvedValue(null);
    salesService.create.mockRejectedValue(new Error('Insufficient stock for product'));

    const result = await service.batchSync(
      schemaName,
      branchId,
      [{ clientSaleRef, sale: { items: [{ productId, quantity: 99 }] } }],
      {},
    );

    expect(result.results[0]).toMatchObject({
      clientSaleRef,
      status: 'conflict',
      message: 'Insufficient stock for product',
    });
  });

  it('processes batch items independently', async () => {
    const ref2 = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    salesService.findByClientSaleRef.mockResolvedValue(null);
    salesService.create
      .mockResolvedValueOnce({ id: 'sale-1', receipt_number: 'R-1' } as never)
      .mockRejectedValueOnce(new Error('Insufficient inventory'));

    const result = await service.batchSync(
      schemaName,
      branchId,
      [
        { clientSaleRef, sale: { items: [{ productId, quantity: 1 }] } },
        { clientSaleRef: ref2, sale: { items: [{ productId, quantity: 1 }] } },
      ],
      {},
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('accepted');
    expect(result.results[1].status).toBe('conflict');
  });

  describe('batchSyncCashMovements', () => {
    const clientRef = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    it('requires branch id for cash movements', async () => {
      await expect(
        service.batchSyncCashMovements(schemaName, '', []),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a new cash movement', async () => {
      cashDrawerService.createMovement.mockResolvedValue({ id: 'mov-1' } as never);

      const result = await service.batchSyncCashMovements(schemaName, branchId, [
        {
          clientRef,
          sessionId,
          movementType: 'cash_in',
          amount: 50,
        },
      ]);

      expect(cashDrawerService.createMovement).toHaveBeenCalledWith(
        schemaName,
        sessionId,
        branchId,
        expect.objectContaining({ clientRef, movementType: 'cash_in', amount: 50 }),
        null,
      );
      expect(result.results[0]).toEqual({
        clientRef,
        status: 'accepted',
        movementId: 'mov-1',
      });
    });

    it('marks duplicate cash movement client_ref', async () => {
      cashDrawerService.createMovement.mockRejectedValue(
        new Error('duplicate client_ref'),
      );

      const result = await service.batchSyncCashMovements(schemaName, branchId, [
        {
          clientRef,
          sessionId,
          movementType: 'cash_out',
          amount: 10,
        },
      ]);

      expect(result.results[0].status).toBe('duplicate');
    });

    it('replays duplicate cash movement idempotently across batch sync', async () => {
      cashDrawerService.createMovement
        .mockRejectedValueOnce(new Error('duplicate client_ref'))
        .mockResolvedValueOnce({ id: 'mov-2' } as never);

      const ref2 = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const result = await service.batchSyncCashMovements(schemaName, branchId, [
        { clientRef, sessionId, movementType: 'cash_in', amount: 20 },
        { clientRef: ref2, sessionId, movementType: 'safe_drop', amount: 100 },
      ]);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('duplicate');
      expect(result.results[1].status).toBe('accepted');
    });
  });
});
