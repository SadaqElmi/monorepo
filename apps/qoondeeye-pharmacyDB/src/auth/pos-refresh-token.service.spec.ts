import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PosRefreshTokenService } from './pos-refresh-token.service';

describe('PosRefreshTokenService', () => {
  const schemaName = 'pharmacy_alpha';
  const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const deviceId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  function createService() {
    const tx = {
      $queryRawUnsafe: jest.fn(),
    };
    const prisma = {
      withTenantSchema: jest.fn(
        async (_schema: string, cb: (t: typeof tx) => Promise<unknown>) =>
          cb(tx),
      ),
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_EXPIRES_IN') return '900';
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return '7';
        return undefined;
      }),
    };
    const service = new PosRefreshTokenService(
      prisma as never,
      jwtService as never,
      config as never,
    );
    return { service, prisma, tx, jwtService };
  }

  it('issues access and refresh token pair', async () => {
    const { service, tx } = createService();
    tx.$queryRawUnsafe.mockResolvedValue(undefined);

    const pair = await service.issuePair({
      schemaName,
      userId,
      deviceId,
      role: 'cashier',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      staffId: 'EMP001',
      permissionCodes: ['pos_sell'],
    });

    expect(pair.accessToken).toBe('access-token');
    expect(pair.refreshToken).toHaveLength(64);
    expect(pair.expiresIn).toBe(900);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pos_refresh_tokens'),
      userId,
      deviceId,
      expect.any(String),
      expect.any(Date),
    );
  });

  it('rotates refresh token and revokes the old one', async () => {
    const { service, tx, jwtService } = createService();
    const oldRowId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const newRowId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    tx.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: oldRowId,
          user_id: userId,
          device_id: deviceId,
          expires_at: new Date(Date.now() + 60_000),
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: userId,
          staff_id: 'EMP001',
          branch_id: 'branch-1',
          role_name: 'cashier',
        },
      ])
      .mockResolvedValueOnce([{ name: 'pos_sell' }])
      .mockResolvedValueOnce([{ id: newRowId }])
      .mockResolvedValueOnce(undefined);

    const rotated = await service.rotateRefreshToken({
      schemaName,
      refreshToken: 'a'.repeat(64),
      deviceId,
    });

    expect(rotated.accessToken).toBe('access-token');
    expect(rotated.refreshToken).toHaveLength(64);
    expect(jwtService.signAsync).toHaveBeenCalled();
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('SET revoked_at = NOW()'),
      oldRowId,
      newRowId,
    );
  });

  it('rejects revoked refresh tokens', async () => {
    const { service, tx } = createService();
    tx.$queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      service.rotateRefreshToken({
        schemaName,
        refreshToken: 'deadbeef',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh token when device mismatches', async () => {
    const { service, tx } = createService();
    tx.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'row-1',
        user_id: userId,
        device_id: deviceId,
        expires_at: new Date(Date.now() + 60_000),
        revoked_at: null,
      },
    ]);

    await expect(
      service.rotateRefreshToken({
        schemaName,
        refreshToken: 'deadbeef',
        deviceId: 'other-device',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
