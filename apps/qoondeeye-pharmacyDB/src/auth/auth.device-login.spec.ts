import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { getTenantControlById } from '../tenant/tenant-control.repository';
import type { PosAuthRateLimitService } from './pos-auth-rate-limit.service';

jest.mock('../tenant/tenant-control.repository', () => ({
  getTenantControlById: jest.fn(),
}));

const getTenantControlByIdMock = getTenantControlById as jest.MockedFunction<
  typeof getTenantControlById
>;

/** Narrow view of `AuthService` private helpers used only in these tests. */
type AuthDeviceLoginInternals = {
  buildStaffLoginLockKey(deviceId: string, staffId: string): string;
  encodeDeviceCredential(deviceId: string, plainSecret: string): string;
  hashDeviceSecret(plainSecret: string): string;
  resolvePosDeviceFromCredential(credential: string): Promise<unknown>;
  jwtService: Pick<JwtService, 'signAsync'> & { signAsync: jest.Mock };
  tenantService: { applyTenantSchemaPatches: jest.Mock };
  posAuthRateLimit: PosAuthRateLimitService;
};

function authDeviceHooks(service: AuthService): AuthDeviceLoginInternals {
  return service as unknown as AuthDeviceLoginInternals;
}

function createRateLimitMock(): PosAuthRateLimitService {
  return {
    assertNotLocked: jest.fn().mockResolvedValue(undefined),
    registerFailure: jest.fn().mockResolvedValue(undefined),
    clearFailures: jest.fn().mockResolvedValue(undefined),
  } as unknown as PosAuthRateLimitService;
}

function createService(overrides?: {
  configGet?: (key: string) => string | undefined;
  queryRows?: unknown[];
  rateLimit?: PosAuthRateLimitService;
}) {
  const prisma = {
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValue(overrides?.queryRows ? [...overrides.queryRows] : []),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    withTenantSchema: jest.fn(),
    queryRawUnsafe: jest.fn(),
    systemUser: { findUnique: jest.fn() },
    posDevice: {
      findUnique: jest.fn(),
    },
  };
  const jwtService = { signAsync: jest.fn() };
  const config = {
    get: jest
      .fn()
      .mockImplementation((key: string) => overrides?.configGet?.(key)),
  };
  const tenantContext = { getTenant: jest.fn(), getSchemaName: jest.fn() };
  const tenantService = {
    findBySchemaNameAny: jest.fn(),
    applyTenantSchemaPatches: jest.fn(),
    findAll: jest.fn(),
  };
  const posAuthRateLimit = overrides?.rateLimit ?? createRateLimitMock();
  const posAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const posRefreshTokens = {
    issuePair: jest.fn().mockResolvedValue({
      accessToken: 'signed-token',
      refreshToken: 'refresh-token-hex',
      expiresIn: 900,
    }),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    config as never,
    tenantContext as never,
    tenantService as never,
    posAuthRateLimit,
    posAudit as never,
    posRefreshTokens as never,
    {
      ensureShiftForLogin: jest.fn(),
    } as never,
  );
  return { service, prisma, config, posAuthRateLimit, posRefreshTokens };
}

describe('AuthService device-bound login helpers', () => {
  beforeEach(() => {
    getTenantControlByIdMock.mockReset();
  });

  it('locks out staff login via rate limit service', async () => {
    const rateLimit = createRateLimitMock();
    rateLimit.assertNotLocked = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('locked'));
    const { service } = createService({ rateLimit });

    const a = authDeviceHooks(service);
    const secret = 'abc123';
    const credential = a.encodeDeviceCredential('device-uuid', secret);
    const hash = a.hashDeviceSecret(secret);

    const { prisma } = createService({ rateLimit });
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;
    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'device-uuid',
      tenantId: 'tenant-id',
      deviceCode: 'POS-1',
      status: 'active',
      bindingStatus: 'bound',
      deviceSecretHash: hash,
      branchId: null,
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-id',
      schemaName: 'pharmacy1',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-url',
    } as never);

    await expect(
      service.staffLogin({
        staffId: 'EMP001',
        pin: '1234',
        deviceCredential: credential,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid device secret while resolving credential', async () => {
    const { service, prisma } = createService();
    const a = authDeviceHooks(service);
    const validSecret = 'abc123';
    const credential = a.encodeDeviceCredential('device-uuid', validSecret);
    const hash = a.hashDeviceSecret('different-secret');

    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'device-uuid',
      tenantId: 'tenant-id',
      deviceCode: 'POS-1',
      status: 'active',
      bindingStatus: 'bound',
      deviceSecretHash: hash,
      branchId: null,
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-id',
      schemaName: 'pharmacy1',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-url',
    } as never);

    await expect(
      a.resolvePosDeviceFromCredential(credential),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects credentials for unbound terminals', async () => {
    const { service, prisma } = createService();
    const a = authDeviceHooks(service);
    const secret = 'abc123';
    const credential = a.encodeDeviceCredential('device-uuid', secret);
    const hash = a.hashDeviceSecret(secret);

    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'device-uuid',
      tenantId: 'tenant-id',
      deviceCode: 'POS-1',
      status: 'active',
      bindingStatus: 'unbound',
      deviceSecretHash: hash,
      branchId: null,
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-id',
      schemaName: 'pharmacy1',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-url',
    } as never);

    await expect(
      a.resolvePosDeviceFromCredential(credential),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('staffLogin resolves tenant from device and scopes query to that tenant', async () => {
    const { service, prisma, posRefreshTokens } = createService();
    const a = authDeviceHooks(service);
    const jwt = a.jwtService;
    const tenantService = a.tenantService;
    const deviceSecret = 'device-secret';
    const deviceCredential = a.encodeDeviceCredential(
      'device-id',
      deviceSecret,
    );
    const deviceHash = a.hashDeviceSecret(deviceSecret);
    const pinHash = await bcrypt.hash('1234', 4);

    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'device-id',
      tenantId: 'tenant-id',
      deviceCode: 'POS-1',
      status: 'active',
      bindingStatus: 'bound',
      deviceSecretHash: deviceHash,
      branchId: 'branch-1',
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-id',
      schemaName: 'pharmacy_alpha',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-url',
    } as never);
    prisma.withTenantSchema.mockImplementation(
      async (
        _schemaName: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) =>
        cb({
          $queryRawUnsafe: jest.fn().mockResolvedValue([
            {
              id: 'cashier-id',
              email: 'cashier@example.com',
              name: 'Cashier',
              staff_id: 'EMP001',
              pin_hash: pinHash,
              branch_id: 'branch-1',
              role_name: 'cashier',
            },
          ]),
        }),
    );
    jwt.signAsync.mockResolvedValue('signed-token');

    const res = await service.staffLogin({
      staffId: 'EMP001',
      pin: '1234',
      deviceCredential,
    });

    expect(tenantService.applyTenantSchemaPatches).toHaveBeenCalledWith(
      'pharmacy_alpha',
    );
    expect(prisma.withTenantSchema).toHaveBeenCalledWith(
      'pharmacy_alpha',
      expect.any(Function),
    );
    expect(res.tenantSlug).toBe('pharmacy_alpha');
    expect(res.token).toBe('signed-token');
    expect(res.refreshToken).toBe('refresh-token-hex');
    expect(res.role).toBe('cashier');
    expect(res.staffId).toBe('EMP001');
    expect(posRefreshTokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'pharmacy_alpha',
        userId: 'cashier-id',
        deviceId: 'device-id',
        role: 'cashier',
        staffId: 'EMP001',
        branchId: 'branch-1',
      }),
    );
  });

  it('setupPosTerminal binds an unbound terminal and returns deviceCredential', async () => {
    const { service, prisma } = createService();
    const setupHash = await bcrypt.hash('setup-pass', 4);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'terminal-1',
        tenant_id: 'tenant-id',
        display_name: 'Counter 1',
        status: 'active',
        binding_status: 'unbound',
        setup_password_hash: setupHash,
        branch_id: 'branch-1',
        tenant_schema_name: 'pharmacy1',
        tenant_subdomain: 'pharmacy1',
        tenant_slug: 'pharmacy1',
        tenant_status: 'active',
        database_url_encrypted: 'encrypted-url',
      },
    ]);
    prisma.withTenantSchema.mockImplementation(
      async (
        _schemaName: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) =>
        cb({
          $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'branch-1' }]),
        }),
    );

    const result = await service.setupPosTerminal({
      terminalUsername: 'hayatpos01',
      password: 'setup-pass',
      deviceFingerprint: 'fp-test',
    });

    expect(result.deviceCredential).toMatch(/^pdv1\.terminal-1\./);
    expect(result.tenantSlug).toBe('pharmacy1');
    expect(result.terminalId).toBe('terminal-1');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });

  it('setupPosTerminal resolves terminal by display name when tenant code is provided', async () => {
    const { service, prisma } = createService();
    const setupHash = await bcrypt.hash('setup-pass', 4);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'terminal-1',
        tenant_id: 'tenant-id',
        display_name: 'POS1',
        terminal_username: 'pos01',
        status: 'active',
        binding_status: 'unbound',
        setup_password_hash: setupHash,
        branch_id: 'branch-1',
        tenant_schema_name: 'wakiil',
        tenant_subdomain: 'wakiil',
        tenant_slug: 'wakiil',
        tenant_status: 'active',
        database_url_encrypted: 'encrypted-url',
      },
    ]);
    prisma.withTenantSchema.mockImplementation(
      async (
        _schemaName: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) =>
        cb({
          $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'branch-1' }]),
        }),
    );

    const result = await service.setupPosTerminal({
      tenantCode: 'wakiil',
      terminalUsername: 'POS1',
      password: 'setup-pass',
      deviceFingerprint: 'fp-test',
    });

    expect(result.terminalId).toBe('terminal-1');
    expect(result.deviceCredential).toMatch(/^pdv1\.terminal-1\./);
  });

  it('setupPosTerminal rejects mismatched tenantCode', async () => {
    const { service, prisma } = createService();
    const setupHash = await bcrypt.hash('setup-pass', 4);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'terminal-1',
        tenant_id: 'tenant-id',
        display_name: 'Counter 1',
        status: 'active',
        binding_status: 'unbound',
        setup_password_hash: setupHash,
        branch_id: 'branch-1',
        tenant_schema_name: 'hayat',
        tenant_subdomain: 'hayat',
        tenant_slug: 'hayat',
        tenant_status: 'active',
        database_url_encrypted: 'encrypted-url',
      },
    ]);

    await expect(
      service.setupPosTerminal({
        tenantCode: 'aman',
        terminalUsername: 'hayatpos01',
        password: 'setup-pass',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getPosDeviceStatus returns ok for valid bound credential', async () => {
    const { service, prisma } = createService();
    const secret = 'device-secret-abc';
    const credential = authDeviceHooks(service).encodeDeviceCredential(
      'device-1',
      secret,
    );
    const hash = authDeviceHooks(service).hashDeviceSecret(secret);

    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'device-1',
      tenantId: 'tenant-id',
      status: 'active',
      bindingStatus: 'bound',
      deviceSecretHash: hash,
      displayName: 'Counter 1',
      branchId: 'branch-1',
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-id',
      schemaName: 'hayat',
      slug: 'hayat',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-url',
    } as never);

    const result = await service.getPosDeviceStatus(credential);
    expect(result.ok).toBe(true);
    expect(result.tenantSlug).toBe('hayat');
  });

  it('getPosDeviceStatus returns revoked for revoked terminal', async () => {
    const { service, prisma } = createService();
    const secret = 'device-secret-abc';
    const credential = authDeviceHooks(service).encodeDeviceCredential(
      'device-1',
      secret,
    );
    const hash = authDeviceHooks(service).hashDeviceSecret(secret);

    prisma.posDevice.findUnique.mockResolvedValueOnce({
      id: 'device-1',
      tenantId: 'tenant-id',
      status: 'active',
      bindingStatus: 'revoked',
      deviceSecretHash: hash,
      displayName: 'Counter 1',
      branchId: 'branch-1',
    });
    getTenantControlByIdMock.mockResolvedValueOnce({
      id: 'tenant-id',
      schemaName: 'hayat',
      slug: 'hayat',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-url',
    } as never);

    const result = await service.getPosDeviceStatus(credential);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('revoked');
  });
});
