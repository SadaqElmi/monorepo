import { NotFoundException } from '@nestjs/common';
import { PosCashDrawerService } from './pos-cash-drawer.service';

describe('PosCashDrawerService', () => {
  const schemaName = 'hayat';
  const branchId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const sessionId = 's0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const clientRef = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  function buildService(queryRaw: jest.Mock) {
    const prisma = {
      withTenantSchema: jest.fn(
        async (
          _schema: string,
          cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
        ) => cb({ $queryRawUnsafe: queryRaw }),
      ),
    };
    return new PosCashDrawerService(prisma as never);
  }

  it('rejects movement when session is not open', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([]);
    const service = buildService(queryRaw);

    await expect(
      service.createMovement(
        schemaName,
        sessionId,
        branchId,
        { movementType: 'cash_in', amount: 50 },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deduplicates movement by clientRef', async () => {
    const existing = {
      id: 'mov-1',
      session_id: sessionId,
      branch_id: branchId,
      movement_type: 'safe_drop',
      amount: '100',
      reason_code: null,
      note: null,
      created_by: 'user-1',
      client_ref: clientRef,
      created_at: new Date(),
    };
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: sessionId }])
      .mockResolvedValueOnce([existing]);

    const service = buildService(queryRaw);
    const result = await service.createMovement(
      schemaName,
      sessionId,
      branchId,
      { movementType: 'safe_drop', amount: 100, clientRef },
      'user-1',
    );

    expect(result.id).toBe('mov-1');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('computes drawer balance from opening cash, sales, and movements', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ opening_cash: '200' }])
      .mockResolvedValueOnce([{ total: '150' }])
      .mockResolvedValueOnce([{ net: '-30' }]);

    const service = buildService(queryRaw);
    const balance = await service.getDrawerBalance(schemaName, sessionId, branchId);

    expect(balance).toEqual({
      sessionId,
      openingCash: 200,
      cashSalesTotal: 150,
      movementsNet: -30,
      drawerBalance: 320,
    });
  });
});
