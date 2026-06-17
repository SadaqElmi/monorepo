/**
 * POS auth flow smoke tests — terminal setup then staff login.
 * Complements auth.device-login.spec.ts unit coverage.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { getTenantControlById } from '../src/tenant/tenant-control.repository';

jest.mock('../src/tenant/tenant-control.repository', () => ({
  getTenantControlById: jest.fn(),
}));

const getTenantControlByIdMock = getTenantControlById as jest.MockedFunction<
  typeof getTenantControlById
>;

function createPosRefreshTokensMock() {
  return {
    issuePair: jest.fn().mockResolvedValue({
      accessToken: 'jwt-token',
      refreshToken: 'refresh-token-hex',
      expiresIn: 900,
    }),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
  };
}

describe('POS auth flow (setup → staff login)', () => {
  beforeEach(() => {
    getTenantControlByIdMock.mockReset();
  });

  it('binds terminal then issues JWT for staff PIN login', async () => {
    const setupHash = await bcrypt.hash('setup-pass', 4);
    const pinHash = await bcrypt.hash('1234', 4);
    const deviceSecret = 'bound-device-secret';

    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      withTenantSchema: jest.fn(),
      systemUser: { findUnique: jest.fn() },
      posDevice: { findUnique: jest.fn() },
    };
    const jwtService = { signAsync: jest.fn().mockResolvedValue('jwt-token') };
    const config = { get: jest.fn() };
    const tenantContext = { getTenant: jest.fn(), getSchemaName: jest.fn() };
    const tenantService = {
      applyTenantSchemaPatches: jest.fn(),
      findAll: jest.fn(),
      findBySchemaNameAny: jest.fn(),
    };
    const posAuthRateLimit = {
      assertNotLocked: jest.fn().mockResolvedValue(undefined),
      registerFailure: jest.fn().mockResolvedValue(undefined),
      clearFailures: jest.fn().mockResolvedValue(undefined),
    };
    const posAudit = { record: jest.fn().mockResolvedValue(undefined) };
    const posRefreshTokens = createPosRefreshTokensMock();

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      config as never,
      tenantContext as never,
      tenantService as never,
      posAuthRateLimit as never,
      posAudit as never,
      posRefreshTokens as never,
    );

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'terminal-uuid',
        tenant_id: 'tenant-uuid',
        display_name: 'Counter 1',
        status: 'active',
        binding_status: 'unbound',
        setup_password_hash: setupHash,
        branch_id: 'branch-uuid',
        tenant_schema_name: 'hayat',
        tenant_subdomain: 'hayat',
        tenant_slug: 'hayat',
        tenant_status: 'active',
      },
    ]);
    prisma.withTenantSchema.mockImplementation(
      async (
        _schema: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) => {
        const tx = {
          $queryRawUnsafe: jest
            .fn()
            .mockResolvedValueOnce([{ id: 'branch-uuid' }])
            .mockResolvedValueOnce([
              {
                id: 'staff-uuid',
                email: null,
                name: 'Cashier',
                staff_id: 'EMP001',
                pin_hash: pinHash,
                branch_id: 'branch-uuid',
                role_name: 'cashier',
              },
            ]),
        };
        return cb(tx);
      },
    );

    const setup = await service.setupPosTerminal({
      terminalUsername: 'hayatpos01',
      password: 'setup-pass',
      tenantCode: 'hayat',
    });
    expect(setup.deviceCredential).toMatch(/^pdv1\./);

    const secret = setup.deviceCredential.split('.')[2]!;
    const secretHash = createHashFromAuthService(service, secret);

    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'terminal-uuid',
      tenantId: 'tenant-uuid',
      deviceCode: 'TERM-1',
      status: 'active',
      bindingStatus: 'bound',
      deviceSecretHash: secretHash,
      branchId: 'branch-uuid',
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-uuid',
      schemaName: 'hayat',
      status: 'active',
    } as never);

    const login = await service.staffLogin({
      staffId: 'EMP001',
      pin: '1234',
      deviceCredential: setup.deviceCredential,
    });

    expect(login.token).toBe('jwt-token');
    expect(login.refreshToken).toBe('refresh-token-hex');
    expect(login.staffId).toBe('EMP001');
    expect(login.role).toBe('cashier');
    expect(posRefreshTokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'EMP001',
        role: 'cashier',
      }),
    );
  });

  it('rejects mismatched tenant code at setup', async () => {
    const setupHash = await bcrypt.hash('setup-pass', 4);
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          id: 'terminal-uuid',
          tenant_id: 'tenant-uuid',
          display_name: 'Counter 1',
          status: 'active',
          binding_status: 'unbound',
          setup_password_hash: setupHash,
          branch_id: null,
          tenant_schema_name: 'hayat',
          tenant_subdomain: 'hayat',
          tenant_slug: 'hayat',
          tenant_status: 'active',
        },
      ]),
      $executeRawUnsafe: jest.fn(),
      withTenantSchema: jest.fn(),
      systemUser: { findUnique: jest.fn() },
      posDevice: { findUnique: jest.fn() },
    };
    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      { getTenant: jest.fn(), getSchemaName: jest.fn() } as never,
      { applyTenantSchemaPatches: jest.fn(), findAll: jest.fn() } as never,
      {
        assertNotLocked: jest.fn().mockResolvedValue(undefined),
        registerFailure: jest.fn().mockResolvedValue(undefined),
        clearFailures: jest.fn().mockResolvedValue(undefined),
      } as never,
      { record: jest.fn() } as never,
      createPosRefreshTokensMock() as never,
    );

    await expect(
      service.setupPosTerminal({
        tenantCode: 'aman',
        terminalUsername: 'hayatpos01',
        password: 'setup-pass',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects staff login without valid device credential', async () => {
    const prisma = {
      posDevice: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      withTenantSchema: jest.fn(),
      systemUser: { findUnique: jest.fn() },
    };
    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      { getTenant: jest.fn(), getSchemaName: jest.fn() } as never,
      { applyTenantSchemaPatches: jest.fn(), findAll: jest.fn() } as never,
      {
        assertNotLocked: jest.fn().mockResolvedValue(undefined),
        registerFailure: jest.fn().mockResolvedValue(undefined),
        clearFailures: jest.fn().mockResolvedValue(undefined),
      } as never,
      { record: jest.fn() } as never,
      createPosRefreshTokensMock() as never,
    );

    await expect(
      service.staffLogin({
        staffId: 'EMP001',
        pin: '1234',
        deviceCredential: 'pdv1.bad-id.bad-secret',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createHashFromAuthService(service: AuthService, secret: string): string {
  const internals = service as unknown as {
    hashDeviceSecret(value: string): string;
  };
  return internals.hashDeviceSecret(secret);
}
