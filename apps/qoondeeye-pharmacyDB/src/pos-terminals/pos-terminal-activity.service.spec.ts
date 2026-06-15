import { PosTerminalActivityService } from './pos-terminal-activity.service';

describe('PosTerminalActivityService', () => {
  it('delegates getActivity to dependencies', async () => {
    const terminal = { id: 'dev-1', displayName: 'POS1' };
    const posTerminals = {
      findOne: jest.fn().mockResolvedValue(terminal),
    };
    const prisma = {
      withTenantSchema: jest.fn(async (_schema: string, fn: (tx: unknown) => unknown) => {
        const tx = {
          $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('COUNT')) {
              return Promise.resolve([{ count: BigInt(0) }]);
            }
            return Promise.resolve([]);
          }),
        };
        return fn(tx);
      }),
    };

    const service = new PosTerminalActivityService(
      prisma as never,
      posTerminals as never,
    );

    const result = await service.getActivity(
      'tenant-id',
      'wakiil',
      'dev-1',
      { page: 1, limit: 10 },
    );

    expect(posTerminals.findOne).toHaveBeenCalledWith(
      'tenant-id',
      'wakiil',
      'dev-1',
    );
    expect(result.terminal).toEqual(terminal);
    expect(result.stats).toEqual({
      salesLast24h: 0,
      loginFailuresLast24h: 0,
    });
  });
});
