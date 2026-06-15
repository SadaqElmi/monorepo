import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../common/security/branch-access.policy';
import { getTenantControlById, listActiveDedicatedTenants } from '../tenant/tenant-control.repository';
import { PosAuthRateLimitService } from './pos-auth-rate-limit.service';
import { PosAuditService } from './pos-audit.service';
import { PosRefreshTokenService } from './pos-refresh-token.service';

/** Response shape for unified login (frontend uses for redirect) */
export type LoginResponse = {
  user: {
    id: string;
    email: string;
    name: string | null;
    staffId?: string | null;
  };
  token: string;
  /** POS device-bound staff login only — rotated on refresh. */
  refreshToken?: string;
  /** Access token TTL in seconds (POS staff login). */
  expiresIn?: number;
  userId: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
  userType: 'system' | 'tenant';
  defaultBranchId: string | null;
  assignedBranchId: string | null;
  allowedBranchIds: string[];
  canViewAllBranches: boolean;
  staffId?: string | null;
  /** Tenant permission codes embedded in JWT (re-login refreshes). */
  permissions?: string[];
};

/** Response shape for pharmacy owner register */
export type RegisterResponse = {
  user: { id: string; email: string; name: string | null };
  token: string;
  userId: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  userType: 'tenant';
  permissions: string[];
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly staffLoginMaxFailures = 5;
  private readonly staffLoginLockWindowMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly posAuthRateLimit: PosAuthRateLimitService,
    private readonly posAudit: PosAuditService,
    private readonly posRefreshTokens: PosRefreshTokenService,
  ) {}

  private tenantTableRef(_schemaName: string, tableName: string): Prisma.Sql {
    return Prisma.raw(`"${tableName.replace(/"/g, '""')}"`);
  }

  // ---------- Unified Login ----------
  /** Single login: try system user first, then tenant user (if tenant provided). */
  async login(input: {
    email: string;
    password: string;
    tenant?: string;
  }): Promise<LoginResponse> {
    // 1) Try system user (super_admin)
    const systemUser = await this.prisma.systemUser.findUnique({
      where: { email: input.email },
    });
    if (systemUser) {
      const match = await bcrypt.compare(input.password, systemUser.password);
      if (match) {
        const token = await this.signToken({
          sub: systemUser.id,
          role: systemUser.role,
          type: 'super_admin',
        });
        return {
          user: {
            id: systemUser.id,
            email: systemUser.email,
            name: systemUser.name,
          },
          token,
          userId: systemUser.id,
          role: systemUser.role,
          tenantId: null,
          tenantSlug: null,
          userType: 'system',
          defaultBranchId: null,
          assignedBranchId: null,
          allowedBranchIds: [],
          canViewAllBranches: true,
        };
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2) Try tenant user: resolve pharmacy from user's email (each user belongs to one tenant)
    let tenant = null as {
      id: string;
      schemaName: string;
      name: string;
    } | null;
    if (input.tenant?.trim()) {
      const slug = input.tenant.trim();
      const anyTenant =
        (await this.tenantService.findBySubdomainAny(slug)) ??
        (await this.tenantService.findBySchemaNameAny(slug));
      if (!anyTenant) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (anyTenant.status !== 'active' || !anyTenant.databaseUrlEncrypted) {
        throw new UnauthorizedException('Tenant is unavailable');
      }
      tenant = {
        id: anyTenant.id,
        schemaName: anyTenant.schemaName,
        name: anyTenant.name,
      };
    } else {
      tenant = await this.findTenantByUserEmail(input.email);
    }

    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.tenantService.applyTenantSchemaPatches(tenant.schemaName);

    return this.prisma.withTenantSchema(tenant.schemaName, async (tx) => {
      const [user] = await tx.$queryRawUnsafe<
        {
          id: string;
          email: string | null;
          name: string | null;
          password: string | null;
          role_name: string | null;
          branch_id: string | null;
        }[]
      >(
        `SELECT u.id, u.email, u.name, u.password, r.name AS role_name
            , u.branch_id
         FROM "users" u
         LEFT JOIN "roles" r ON u.role_id = r.id
         WHERE u.email = $1`,
        input.email,
      );

      if (!user?.email || !user.password) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const match = await bcrypt.compare(input.password, user.password);
      if (!match) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const role = user.role_name ?? 'user';
      const roleLower = normalizeRole(role);
      if (roleLower === 'cashier') {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (requiresAssignedBranch(role) && !user.branch_id) {
        throw new UnauthorizedException('User branch assignment is required');
      }

      let permissionCodes = await this.loadTenantPermissionCodes(
        tenant.schemaName,
        user.id,
      );

      const token = await this.signToken({
        sub: user.id,
        role,
        type: 'tenant_user',
        tenantSchema: tenant.schemaName,
        tenantId: tenant.id,
        canViewAllBranches: hasGlobalBranchAccess(roleLower),
        permissions: permissionCodes,
      });

      const allowedBranchIds = hasGlobalBranchAccess(roleLower)
        ? (
            await tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM "branches" ORDER BY name`,
            )
          ).map((row) => row.id)
        : user.branch_id
          ? [user.branch_id]
          : [];
      const defaultBranchId = user.branch_id ?? null;
      const canViewAllBranches = hasGlobalBranchAccess(roleLower);
      await this.markTenantLastLogin(tenant.id);

      return {
        user: { id: user.id, email: user.email, name: user.name },
        token,
        userId: user.id,
        role,
        tenantId: tenant.id,
        tenantSlug: tenant.schemaName,
        userType: 'tenant',
        defaultBranchId,
        assignedBranchId: user.branch_id ?? null,
        allowedBranchIds,
        canViewAllBranches,
        permissions: permissionCodes,
      };
    });
  }

  async staffLogin(input: {
    staffId: string;
    pin: string;
    deviceCredential: string;
    branchId?: string;
  }): Promise<LoginResponse> {
    const identifier = input.staffId.trim();
    if (!identifier) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const device = await this.resolvePosDeviceFromCredential(
      input.deviceCredential,
    );
    const lockKey = this.buildStaffLoginLockKey(device.id, identifier);
    await this.posAuthRateLimit.assertNotLocked(
      lockKey,
      this.staffLoginLockWindowMs,
      'Too many failed attempts. Please wait before retrying.',
      'staff_pin',
    );

    await this.tenantService.applyTenantSchemaPatches(device.tenantSchema);

    const matched = await this.prisma.withTenantSchema(
      device.tenantSchema,
      async (tx) => {
        const [row] = await tx.$queryRawUnsafe<
          {
            id: string;
            email: string | null;
            name: string | null;
            staff_id: string | null;
            pin_hash: string;
            branch_id: string | null;
            role_name: string;
          }[]
        >(
          `SELECT u.id, u.email, u.name, u.staff_id, u.pin_hash, u.branch_id,
                  lower(r.name) AS role_name
           FROM "users" u
           INNER JOIN "roles" r ON u.role_id = r.id
           WHERE lower(r.name) IN ('cashier', 'manager', 'admin', 'pharmacist')
             AND u.pin_hash IS NOT NULL
             AND (
               lower(COALESCE(u.staff_id, '')) = lower($1)
               OR u.id::text = $1
             )
           LIMIT 1`,
          identifier,
        );
        return row ?? null;
      },
    );

    if (!matched) {
      await this.posAuthRateLimit.registerFailure(
        lockKey,
        this.staffLoginMaxFailures,
        this.staffLoginLockWindowMs,
      );
      this.logPosAuthEvent('pos_staff_login_failure', {
        tenantId: device.tenantId,
        deviceId: device.id,
        staffId: identifier,
        outcome: 'invalid_staff',
      });
      void this.posAudit.record({
        schemaName: device.tenantSchema,
        deviceId: device.id,
        branchId: device.branchId,
        action: 'pos_staff_login_failure',
        payload: { staffId: identifier, outcome: 'invalid_staff' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const pinMatches = await bcrypt.compare(input.pin, matched.pin_hash);
    if (!pinMatches) {
      await this.posAuthRateLimit.registerFailure(
        lockKey,
        this.staffLoginMaxFailures,
        this.staffLoginLockWindowMs,
      );
      this.logPosAuthEvent('pos_staff_login_failure', {
        tenantId: device.tenantId,
        deviceId: device.id,
        staffId: identifier,
        outcome: 'invalid_pin',
      });
      void this.posAudit.record({
        schemaName: device.tenantSchema,
        deviceId: device.id,
        branchId: device.branchId,
        action: 'pos_staff_login_failure',
        payload: { staffId: identifier, outcome: 'invalid_pin' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!matched.branch_id) {
      throw new UnauthorizedException(
        'Branch assignment is required for POS sign-in',
      );
    }

    if (device.branchId && device.branchId !== matched.branch_id) {
      throw new UnauthorizedException(
        'This user is not assigned to the enrolled device branch',
      );
    }
    if (input.branchId && input.branchId !== matched.branch_id) {
      throw new UnauthorizedException('Access denied to this branch');
    }

    await this.posAuthRateLimit.clearFailures(lockKey);
    await this.touchPosDevice(device.id);

    const resolvedRole = matched.role_name.trim().toLowerCase();
    const resolvedStaffId = matched.staff_id?.trim() || identifier;
    const permissionCodes = await this.loadTenantPermissionCodes(
      device.tenantSchema,
      matched.id,
    );

    this.logPosAuthEvent('pos_staff_login_success', {
      tenantId: device.tenantId,
      deviceId: device.id,
      staffId: identifier,
      branchId: device.branchId ?? matched.branch_id,
      outcome: 'success',
    });
    void this.posAudit.record({
      schemaName: device.tenantSchema,
      deviceId: device.id,
      branchId: device.branchId ?? matched.branch_id,
      actorUserId: matched.id,
      action: 'pos_staff_login_success',
      payload: {
        staffId: resolvedStaffId,
        role: resolvedRole,
      },
    });

    const tokenPair = await this.posRefreshTokens.issuePair({
      schemaName: device.tenantSchema,
      userId: matched.id,
      deviceId: device.id,
      role: resolvedRole,
      tenantId: device.tenantId,
      branchId: device.branchId ?? matched.branch_id,
      staffId: resolvedStaffId,
      permissionCodes,
    });
    await this.markTenantLastLogin(device.tenantId);

    return {
      user: {
        id: matched.id,
        email: matched.email ?? '',
        name: matched.name,
        staffId: resolvedStaffId,
      },
      token: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      userId: matched.id,
      role: resolvedRole,
      tenantId: device.tenantId,
      tenantSlug: device.tenantSchema,
      userType: 'tenant',
      defaultBranchId: matched.branch_id,
      assignedBranchId: matched.branch_id,
      allowedBranchIds: [matched.branch_id],
      canViewAllBranches: false,
      staffId: resolvedStaffId,
      permissions: permissionCodes,
    };
  }

  async refreshPosSession(input: {
    refreshToken: string;
    tenantSlug: string;
    deviceCredential: string;
  }) {
    const device = await this.resolvePosDeviceFromCredential(
      input.deviceCredential,
    );
    if (device.tenantSchema !== input.tenantSlug.trim()) {
      throw new UnauthorizedException('Tenant mismatch');
    }
    const rotated = await this.posRefreshTokens.rotateRefreshToken({
      schemaName: device.tenantSchema,
      refreshToken: input.refreshToken,
      deviceId: device.id,
    });
    return {
      token: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: rotated.expiresIn,
    };
  }

  async setupPosTerminal(input: {
    terminalUsername: string;
    password: string;
    tenantCode?: string;
    deviceFingerprint?: string;
    clientIp?: string;
  }) {
    const terminalUsername = input.terminalUsername.trim().toLowerCase();
    if (!terminalUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const lockKey = `setup:${terminalUsername}`;
    const ipKey = input.clientIp
      ? `user:${input.clientIp}:${terminalUsername}`
      : null;
    await this.posAuthRateLimit.assertNotLocked(
      lockKey,
      this.staffLoginLockWindowMs,
      'Too many failed setup attempts. Try again later.',
      'setup',
    );
    if (ipKey) {
      await this.posAuthRateLimit.assertNotLocked(
        ipKey,
        15 * 60 * 1000,
        'Too many failed setup attempts. Try again later.',
        'setup_ip',
      );
    }

    const requireTenantCode =
      this.config.get<string>('POS_SETUP_REQUIRE_TENANT_CODE') === 'true' ||
      this.config.get<string>('POS_SETUP_REQUIRE_TENANT_CODE') === '1';
    if (requireTenantCode && !input.tenantCode?.trim()) {
      throw new BadRequestException('Tenant code is required');
    }

    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenant_id: string;
        display_name: string | null;
        status: string;
        binding_status: string;
        setup_password_hash: string | null;
        branch_id: string | null;
        tenant_schema_name: string;
        tenant_subdomain: string | null;
        tenant_slug: string | null;
        tenant_status: string;
        database_url_encrypted: string | null;
      }>
    >(
      `SELECT d.id, d.tenant_id, d.display_name, d.status, d.binding_status,
              d.setup_password_hash, d.branch_id,
              t.schema_name AS tenant_schema_name,
              t.subdomain AS tenant_subdomain,
              t.slug AS tenant_slug,
              t.status AS tenant_status,
              t.database_url_encrypted
       FROM "public"."pos_devices" d
       INNER JOIN "public"."Tenant" t ON t.id = d.tenant_id
       WHERE lower(d.terminal_username) = lower($1)
       LIMIT 1`,
      terminalUsername,
    );

    const reject = async (outcome: string): Promise<never> => {
      await this.posAuthRateLimit.registerFailure(
        lockKey,
        this.staffLoginMaxFailures,
        this.staffLoginLockWindowMs,
        'setup',
      );
      if (ipKey) {
        await this.posAuthRateLimit.registerFailure(
          ipKey,
          10,
          15 * 60 * 1000,
          'setup_ip',
        );
      }
      this.logPosAuthEvent('pos_terminal_setup_failure', {
        terminalUsername,
        tenantId: row?.tenant_id,
        outcome,
      });
      if (row?.tenant_schema_name && row?.id) {
        void this.posAudit.record({
          schemaName: row.tenant_schema_name,
          deviceId: row.id,
          branchId: row.branch_id,
          action: 'pos_terminal_setup_failure',
          payload: { terminalUsername, outcome },
        });
      }
      throw new UnauthorizedException('Invalid credentials');
    };

    if (!row?.setup_password_hash) {
      await reject('invalid_credentials');
    }

    const tenantCode = input.tenantCode?.trim().toLowerCase();
    if (requireTenantCode || tenantCode) {
      if (!tenantCode) {
        await reject('tenant_code_required');
      } else {
        const aliases = [
          row!.tenant_schema_name,
          row!.tenant_subdomain,
          row!.tenant_slug,
        ]
          .filter((value): value is string => Boolean(value?.trim()))
          .map((value) => value.trim().toLowerCase());
        if (!aliases.includes(tenantCode)) {
          this.logPosAuthEvent('pos_terminal_setup_failure', {
            terminalUsername,
            tenantId: row!.tenant_id,
            outcome: 'tenant_terminal_mismatch',
          });
          void this.posAudit.record({
            schemaName: row!.tenant_schema_name,
            deviceId: row!.id,
            branchId: row!.branch_id,
            action: 'pos_terminal_setup_failure',
            payload: { terminalUsername, outcome: 'tenant_terminal_mismatch' },
          });
          throw new ForbiddenException({
            message: 'Tenant code does not match this terminal',
            error: 'TENANT_TERMINAL_MISMATCH',
          });
        }
      }
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."pos_devices"
       SET last_setup_attempt_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      row!.id,
    );

    if (
      row!.status !== 'active' ||
      row!.tenant_status !== 'active' ||
      !row!.database_url_encrypted?.trim() ||
      row!.binding_status !== 'unbound'
    ) {
      await reject('inactive_or_bound');
    }

    if (row!.branch_id) {
      const branchExists = await this.prisma.withTenantSchema(
        row!.tenant_schema_name,
        async (tx) => {
          const [branch] = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM "branches" WHERE id = $1::uuid LIMIT 1`,
            row!.branch_id,
          );
          return Boolean(branch);
        },
      );
      if (!branchExists) {
        await reject('branch_not_found');
      }
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      row!.setup_password_hash!,
    );
    if (!passwordMatches) {
      await reject('invalid_password');
    }

    const secret = randomBytes(32).toString('hex');
    const secretHash = this.hashDeviceSecret(secret);
    const fingerprint = input.deviceFingerprint?.trim() || null;

    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."pos_devices"
       SET device_secret_hash = $2,
           binding_status = 'bound',
           setup_password_hash = NULL,
           bound_at = CURRENT_TIMESTAMP,
           device_fingerprint = $3,
           revoked_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      row!.id,
      secretHash,
      fingerprint,
    );

    await this.posAuthRateLimit.clearFailures(lockKey);
    this.logPosAuthEvent('pos_terminal_bound', {
      terminalId: row!.id,
      tenantId: row!.tenant_id,
      terminalUsername,
      branchId: row!.branch_id,
      outcome: 'success',
    });
    void this.posAudit.record({
      schemaName: row!.tenant_schema_name,
      deviceId: row!.id,
      branchId: row!.branch_id,
      action: 'pos_terminal_bound',
      payload: {
        terminalUsername,
        deviceFingerprint: fingerprint,
      },
    });

    return {
      deviceCredential: this.encodeDeviceCredential(row!.id, secret),
      deviceId: row!.id,
      terminalId: row!.id,
      tenantId: row!.tenant_id,
      tenantSlug: row!.tenant_schema_name,
      branchId: row!.branch_id,
      displayName: row!.display_name,
      deviceCode: null as string | null,
      status: 'active' as const,
    };
  }

  /** Shorter session for PIN sign-in (seconds). */
  private cashierJwtSignOptions(): JwtSignOptions {
    const raw =
      this.config.get<string>('JWT_CASHIER_EXPIRES_IN')?.trim() ?? '28800';
    const n = Number(raw);
    const expiresIn = !Number.isNaN(n) && n > 0 ? n : 28800;
    return { expiresIn };
  }

  /**
   * Find which tenant (pharmacy) the user belongs to by searching all active tenant schemas for the email.
   */
  private async findTenantByUserEmail(
    email: string,
  ): Promise<{ id: string; schemaName: string; name: string } | null> {
    const tenants = await listActiveDedicatedTenants(this.prisma);

    for (const tenant of tenants) {
      try {
        const [row] = await this.prisma.withTenantSchema(
          tenant.schemaName,
          (tx) =>
            tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM "users" WHERE email = $1 LIMIT 1`,
              email,
            ),
        );
        await this.markTenantDatabaseHealth(tenant.id, 'connected');
        if (row) {
          return {
            id: tenant.id,
            schemaName: tenant.schemaName,
            name: tenant.name,
          };
        }
      } catch (err) {
        const message = this.sanitizeLogMessage(
          err instanceof Error ? err.message : String(err),
        );
        this.logger.warn(
          JSON.stringify({
            kind: 'tenant_login_scan_skipped',
            tenantId: tenant.id,
            schemaName: tenant.schemaName,
            reason: message,
          }),
        );
        await this.markTenantDatabaseHealth(tenant.id, 'failed').catch(
          () => undefined,
        );
      }
    }
    return null;
  }

  async getPosDeviceStatus(deviceCredential: string) {
    const trimmed = deviceCredential?.trim();
    if (!trimmed) {
      return {
        ok: false as const,
        reason: 'missing' as const,
        status: null,
        bindingStatus: null,
        displayName: null,
        branchId: null,
        tenantSlug: null,
      };
    }

    const parsed = this.decodeDeviceCredential(trimmed);
    if (!parsed) {
      return {
        ok: false as const,
        reason: 'invalid' as const,
        status: null,
        bindingStatus: null,
        displayName: null,
        branchId: null,
        tenantSlug: null,
      };
    }

    const row = await this.prisma.posDevice.findUnique({
      where: { id: parsed.deviceId },
    });
    if (!row) {
      return {
        ok: false as const,
        reason: 'invalid' as const,
        status: null,
        bindingStatus: null,
        displayName: null,
        branchId: null,
        tenantSlug: null,
      };
    }

    const tenant = await getTenantControlById(this.prisma, row.tenantId);
    const bindingStatus = row.bindingStatus ?? 'unbound';

    if (bindingStatus === 'revoked') {
      return {
        ok: false as const,
        reason: 'revoked' as const,
        status: row.status,
        bindingStatus,
        displayName: row.displayName,
        branchId: row.branchId,
        tenantSlug: tenant?.slug ?? null,
      };
    }

    if (
      row.status !== 'active' ||
      tenant?.status !== 'active' ||
      !tenant.databaseUrlEncrypted?.trim()
    ) {
      return {
        ok: false as const,
        reason: 'inactive' as const,
        status: row.status,
        bindingStatus,
        displayName: row.displayName,
        branchId: row.branchId,
        tenantSlug: tenant?.slug ?? null,
      };
    }

    if (bindingStatus !== 'bound' || !row.deviceSecretHash?.trim()) {
      return {
        ok: false as const,
        reason: 'invalid' as const,
        status: row.status,
        bindingStatus,
        displayName: row.displayName,
        branchId: row.branchId,
        tenantSlug: tenant?.slug ?? null,
      };
    }

    const expected = this.hashDeviceSecret(parsed.deviceSecret);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(row.deviceSecretHash, 'utf8');
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return {
        ok: false as const,
        reason: 'invalid' as const,
        status: row.status,
        bindingStatus,
        displayName: row.displayName,
        branchId: row.branchId,
        tenantSlug: tenant?.slug ?? null,
      };
    }

    return {
      ok: true as const,
      reason: null,
      status: row.status,
      bindingStatus,
      displayName: row.displayName,
      branchId: row.branchId,
      tenantSlug: tenant?.slug ?? null,
    };
  }

  private async registerCredentialFailure(deviceId: string | null): Promise<void> {
    if (!deviceId) return;
    await this.posAuthRateLimit.registerFailure(
      `cred:${deviceId}`,
      10,
      15 * 60 * 1000,
      'device_credential',
    );
  }

  async resolvePosDeviceFromCredential(deviceCredential: string) {
    const parsed = this.decodeDeviceCredential(deviceCredential);
    if (!parsed) {
      throw new UnauthorizedException('Invalid device credential');
    }
    await this.posAuthRateLimit.assertNotLocked(
      `cred:${parsed.deviceId}`,
      15 * 60 * 1000,
      'Too many failed attempts. Please wait before retrying.',
      'device_credential',
    );
    const row = await this.prisma.posDevice.findUnique({
      where: { id: parsed.deviceId },
    });

    if (!row) {
      await this.registerCredentialFailure(parsed.deviceId);
      throw new UnauthorizedException('Invalid device credential');
    }
    const tenant = await getTenantControlById(this.prisma, row.tenantId);
    if (!tenant) {
      await this.registerCredentialFailure(parsed.deviceId);
      throw new UnauthorizedException('Invalid device credential');
    }
    if (
      row.status !== 'active' ||
      tenant.status !== 'active' ||
      !tenant.databaseUrlEncrypted?.trim()
    ) {
      await this.registerCredentialFailure(parsed.deviceId);
      throw new UnauthorizedException('Device is not active');
    }

    const bindingStatus = row.bindingStatus ?? 'bound';
    if (bindingStatus !== 'bound') {
      await this.registerCredentialFailure(parsed.deviceId);
      throw new UnauthorizedException('Device is not bound');
    }

    if (!row.deviceSecretHash?.trim()) {
      await this.registerCredentialFailure(parsed.deviceId);
      throw new UnauthorizedException('Invalid device credential');
    }

    const expected = this.hashDeviceSecret(parsed.deviceSecret);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(row.deviceSecretHash, 'utf8');
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      await this.registerCredentialFailure(parsed.deviceId);
      throw new UnauthorizedException('Invalid device credential');
    }

    await this.posAuthRateLimit.clearFailures(`cred:${parsed.deviceId}`);

    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantSchema: tenant.schemaName,
      deviceCode: row.deviceCode,
      branchId: row.branchId,
    };
  }

  private decodeDeviceCredential(
    token: string,
  ): { deviceId: string; deviceSecret: string } | null {
    const trimmed = token.trim();
    if (!trimmed) return null;
    const parts = trimmed.split('.');
    if (parts.length !== 3 || parts[0] !== 'pdv1') {
      return null;
    }
    if (!parts[1] || !parts[2]) return null;
    return { deviceId: parts[1], deviceSecret: parts[2] };
  }

  private encodeDeviceCredential(deviceId: string, secret: string): string {
    return `pdv1.${deviceId}.${secret}`;
  }

  private hashDeviceSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private async touchPosDevice(deviceId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."pos_devices"
       SET last_seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      deviceId,
    );
  }

  private buildStaffLoginLockKey(deviceId: string, staffId: string): string {
    return `${deviceId}:${staffId.trim().toLowerCase()}`;
  }

  private logPosAuthEvent(
    kind: string,
    fields: Record<string, string | null | undefined>,
  ): void {
    this.logger.log(
      JSON.stringify({
        kind,
        at: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  // ---------- Pharmacy Owner Register ----------
  /** Create tenant, provision schema, create first user (admin), return token. */
  async register(input: {
    pharmacy_name: string;
    owner_name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<RegisterResponse> {
    const existingSystemEmail = await this.prisma.systemUser.findUnique({
      where: { email: input.email },
    });
    if (existingSystemEmail) {
      throw new BadRequestException('Email already in use');
    }

    let tenant: { id: string; schemaName: string; name: string };
    try {
      tenant = await this.tenantService.create({
        name: input.pharmacy_name,
        ownerName: input.owner_name,
        ownerEmail: input.email,
        ownerPassword: input.password,
      });
    } catch (e: unknown) {
      const status =
        e &&
        typeof e === 'object' &&
        'getStatus' in e &&
        typeof (e as { getStatus: () => number }).getStatus === 'function'
          ? (e as { getStatus: () => number }).getStatus()
          : (e as { response?: { statusCode?: number } })?.response?.statusCode;
      if (status === 409) {
        throw new BadRequestException(
          'A pharmacy with this name already exists. Try a different name.',
        );
      }
      throw e;
    }

    const insertedRows = await this.prisma.withTenantSchema(
      tenant.schemaName,
      (tx) =>
        tx.$queryRawUnsafe<
          { id: string; email: string; name: string | null }[]
        >(`SELECT id, email, name FROM "users" WHERE email = $1 LIMIT 1`, input.email),
    );
    const inserted = insertedRows[0];
    if (!inserted) {
      throw new BadRequestException('Failed to create owner account');
    }

    const permissionCodes = await this.loadTenantPermissionCodes(
      tenant.schemaName,
      inserted.id,
    );

    const token = await this.signToken({
      sub: inserted.id,
      role: 'admin',
      type: 'tenant_user',
      tenantSchema: tenant.schemaName,
      tenantId: tenant.id,
      permissions: permissionCodes,
    });

    return {
      user: {
        id: inserted.id,
        email: inserted.email,
        name: inserted.name,
      },
      token,
      userId: inserted.id,
      role: 'admin',
      tenantId: tenant.id,
      tenantSlug: tenant.schemaName,
      userType: 'tenant',
      permissions: permissionCodes,
    };
  }

  /** Insert first user (pharmacy owner) into tenant schema with role admin */
  private async createFirstTenantUser(
    schemaName: string,
    input: { name: string; email: string; password: string },
  ): Promise<{ id: string; email: string; name: string | null }[]> {
    const hashed = await bcrypt.hash(input.password, 10);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "users" WHERE email = $1`,
        input.email,
      );
      if (existing.length > 0) {
        throw new BadRequestException('Email already in use for this pharmacy');
      }
      const inserted = await tx.$queryRawUnsafe<
        { id: string; email: string; name: string | null }[]
      >(
        `INSERT INTO "users" (name, email, password, role_id)
         VALUES ($1, $2, $3, (SELECT id FROM "roles" WHERE name = 'admin'))
         RETURNING id, email, name`,
        input.name,
        input.email,
        hashed,
      );
      return inserted;
    });
  }

  // ---------- Super Admin (Platform) ----------

  async superAdminSignUp(input: {
    email: string;
    password: string;
    name?: string;
  }) {
    const existing = await this.prisma.systemUser.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const hashed = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.systemUser.create({
      data: {
        email: input.email,
        password: hashed,
        name: input.name,
        role: 'super_admin',
      },
    });

    const token = await this.signToken({
      sub: user.id,
      role: user.role,
      type: 'super_admin',
    });

    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  async superAdminLogin(input: { email: string; password: string }) {
    const user = await this.prisma.systemUser.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(input.password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.signToken({
      sub: user.id,
      role: user.role,
      type: 'super_admin',
    });

    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  // ---------- Tenant Users (Pharmacy) ----------

  private ensureTenantContext() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    return this.tenantContext.getSchemaName()!;
  }

  async tenantSignUp(input: {
    name?: string;
    email: string;
    password: string;
    roleName?: string;
  }) {
    const schemaName = this.ensureTenantContext();

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "users" WHERE email = $1`,
        input.email,
      );

      if (existing.length > 0) {
        throw new BadRequestException('Email already in use');
      }

      const hashed = await bcrypt.hash(input.password, 10);

      const roleName = input.roleName ?? 'admin';

      const [inserted] = await tx.$queryRawUnsafe<
        { id: string; email: string; name: string | null }[]
      >(
        `INSERT INTO "users" (name, email, password, role_id)
         VALUES (
           $1,
           $2,
           $3,
           (SELECT id FROM "roles" WHERE name = $4)
         )
         RETURNING id, email, name`,
        input.name ?? null,
        input.email,
        hashed,
        roleName,
      );

      if (!inserted) {
        throw new BadRequestException('Failed to create user');
      }

      const permissionCodes = await this.loadTenantPermissionCodes(
        schemaName,
        inserted.id,
      );
      const token = await this.signToken({
        sub: inserted.id,
        role: roleName,
        type: 'tenant_user',
        tenantSchema: schemaName,
        permissions: permissionCodes,
      });

      return {
        user: { id: inserted.id, email: inserted.email, name: inserted.name },
        token,
        permissions: permissionCodes,
      };
    });
  }

  async tenantLogin(input: { email: string; password: string }) {
    const schemaName = this.ensureTenantContext();
    const tenantId = this.tenantContext.getTenantId();

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [user] = await tx.$queryRawUnsafe<
        {
          id: string;
          email: string;
          name: string | null;
          password: string;
          role_name: string | null;
        }[]
      >(
        `SELECT u.id,
                u.email,
                u.name,
                u.password,
                r.name AS role_name
         FROM "users" u
         LEFT JOIN "roles" r ON u.role_id = r.id
         WHERE u.email = $1`,
        input.email,
      );

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const match = await bcrypt.compare(input.password, user.password);
      if (!match) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const roleName = user.role_name ?? 'user';
      if (roleName.toLowerCase() === 'cashier') {
        throw new UnauthorizedException('Invalid credentials');
      }

      let permissionCodes = await this.loadTenantPermissionCodes(
        schemaName,
        user.id,
      );

      const token = await this.signToken({
        sub: user.id,
        role: roleName,
        type: 'tenant_user',
        tenantSchema: schemaName,
        permissions: permissionCodes,
      });
      if (tenantId) {
        await this.markTenantLastLogin(tenantId);
      }

      return {
        user: { id: user.id, email: user.email, name: user.name },
        token,
        permissions: permissionCodes,
      };
    });
  }

  // ---------- Helpers ----------

  private async loadTenantPermissionCodes(
    schemaName: string,
    userId: string,
  ): Promise<string[]> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT DISTINCT p.name AS name
         FROM permissions p
         INNER JOIN role_permissions rp ON rp.permission_id = p.id
         INNER JOIN users u ON u.role_id = rp.role_id
         WHERE u.id = $1::uuid`,
        userId,
      );
      return (rows ?? []).map((r) => r.name).filter(Boolean);
    });
  }

  private async signToken(
    payload: Record<string, unknown>,
    signOptions?: JwtSignOptions,
  ) {
    return this.jwtService.signAsync(payload, signOptions);
  }

  private async markTenantDatabaseHealth(
    tenantId: string,
    status: 'connected' | 'failed',
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."Tenant"
       SET database_health_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      tenantId,
      status,
    );
  }

  private async markTenantLastLogin(tenantId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."Tenant"
       SET last_login_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      tenantId,
    );
  }

  private sanitizeLogMessage(message: string): string {
    return message.replace(
      /postgres(?:ql)?:\/\/[^\s'"]+/gi,
      'postgresql://***',
    );
  }
}
