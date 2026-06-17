import { PosSecurityService } from './pos-security.service';

describe('PosSecurityService', () => {
  const schemaName = 'hayat';
  const branchId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  function buildService(queryRaw: jest.Mock) {
    const prisma = {
      withTenantSchema: jest.fn(
        async (
          _schema: string,
          cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
        ) => cb({ $queryRawUnsafe: queryRaw }),
      ),
    };
    return new PosSecurityService(prisma as never);
  }

  it('records security event', async () => {
    const queryRaw = jest.fn().mockResolvedValue(undefined);
    const service = buildService(queryRaw);

    await service.recordEvent(schemaName, {
      branchId,
      eventType: 'suspicious_void',
      severity: 'high',
      payload: { saleId: 'sale-1' },
    });

    expect(queryRaw).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pos_security_events'),
      branchId,
      null,
      'suspicious_void',
      'high',
      null,
      null,
      JSON.stringify({ saleId: 'sale-1' }),
    );
  });

  it('detects repeated failed PIN attempts', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ cnt: BigInt(12) }])
      .mockResolvedValueOnce([{ cnt: BigInt(2) }])
      .mockResolvedValue(undefined);

    const service = buildService(queryRaw);
    const anomalies = await service.detectAnomalies(schemaName, branchId);

    expect(anomalies).toEqual([
      {
        type: 'repeated_failed_pin',
        message: '12 failed PIN attempts in the last hour',
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('detects unusual refund velocity', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ cnt: BigInt(1) }])
      .mockResolvedValueOnce([{ cnt: BigInt(25) }])
      .mockResolvedValue(undefined);

    const service = buildService(queryRaw);
    const anomalies = await service.detectAnomalies(schemaName, branchId);

    expect(anomalies).toEqual([
      {
        type: 'unusual_refund_velocity',
        message: '25 refunds in the last hour',
      },
    ]);
  });

  it('returns empty list when thresholds are not met', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ cnt: BigInt(3) }])
      .mockResolvedValueOnce([{ cnt: BigInt(5) }]);

    const service = buildService(queryRaw);
    const anomalies = await service.detectAnomalies(schemaName, branchId);

    expect(anomalies).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
