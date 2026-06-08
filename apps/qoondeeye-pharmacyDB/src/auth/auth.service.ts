import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../common/security/branch-access.policy';

/** Response shape for unified login (frontend uses for redirect) */
export type LoginResponse = {
  user: { id: string; email: string; name: string | null };
  token: string;
  userId: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
  userType: 'system' | 'tenant';
  defaultBranchId: string | null;
  assignedBranchId: string | null;
  allowedBranchIds: string[];
  canViewAllBranches: boolean;
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
  private readonly staffLoginLockState = new Map<
    string,
    { failures: number; lockUntil: number; lastFailedAt: number }
  >();
  private readonly staffLoginMaxFailures = 5;
  private readonly staffLoginLockWindowMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
  ) {}

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
      const anyTenant = await this.tenantService.findBySchemaNameAny(slug);
      if (!anyTenant) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (anyTenant.status !== 'active') {
        throw new UnauthorizedException('Tenant is inactive');
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
         FROM "${tenant.schemaName}"."users" u
         LEFT JOIN "${tenant.schemaName}"."roles" r ON u.role_id = r.id
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
              `SELECT id FROM "${tenant.schemaName}"."branches" ORDER BY name`,
            )
          ).map((row) => row.id)
        : user.branch_id
          ? [user.branch_id]
          : [];
      const defaultBranchId = user.branch_id ?? null;
      const canViewAllBranches = hasGlobalBranchAccess(roleLower);

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

  /** POS PIN login: PIN + tenant slug (optional branch and optional staff id). */
  async pinLogin(input: {
    pin: string;
    tenant: string;
    branchId?: string;
    staffId?: string;
  }): Promise<LoginResponse> {
    const slug = input.tenant.trim();
    if (this.isDeviceLoginEnforcedForTenant(slug)) {
      throw new UnauthorizedException(
        'Device-bound login is required for this pharmacy. Use staff ID + PIN.',
      );
    }
    const tenantRow = await this.prisma.tenant.findFirst({
      where: {
        schemaName: { equals: slug, mode: 'insensitive' },
      },
    });
    if (!tenantRow) {
      throw new UnauthorizedException('Pharmacy code not recognized');
    }
    if (tenantRow.status !== 'active') {
      throw new UnauthorizedException('Pharmacy is inactive');
    }
    const tenant = {
      id: tenantRow.id,
      schemaName: tenantRow.schemaName,
      name: tenantRow.name,
    };

    // Public auth routes skip tenant middleware; ensure live tenant schemas have `pin_hash`, etc.
    await this.tenantService.applyTenantSchemaPatches(tenant.schemaName);

    const staffFilter = input.staffId?.trim();

    const usersRef = Prisma.raw(`"${tenant.schemaName}"."users"`);
    const rolesRef = Prisma.raw(`"${tenant.schemaName}"."roles"`);

    return this.prisma.withTenantSchema(tenant.schemaName, async (tx) => {
      // Match PIN against POS-eligible users with a PIN. Optional staffId scopes to one user.
      const candidates = staffFilter
        ? await tx.$queryRaw<
            {
              id: string;
              email: string | null;
              name: string | null;
              pin_hash: string;
              branch_id: string | null;
              role_name: string;
            }[]
          >`
            SELECT u.id, u.email, u.name, u.pin_hash, u.branch_id,
                   lower(r.name) AS role_name
            FROM ${usersRef} u
            INNER JOIN ${rolesRef} r ON u.role_id = r.id
            WHERE lower(r.name) IN ('cashier', 'manager', 'admin', 'pharmacist')
              AND u.pin_hash IS NOT NULL
              AND (
                lower(COALESCE(u.staff_id, '')) = lower(${staffFilter})
                OR u.id::text = ${staffFilter}
              )
          `
        : await tx.$queryRaw<
            {
              id: string;
              email: string | null;
              name: string | null;
              pin_hash: string;
              branch_id: string | null;
              role_name: string;
            }[]
          >`
            SELECT u.id, u.email, u.name, u.pin_hash, u.branch_id,
                   lower(r.name) AS role_name
            FROM ${usersRef} u
            INNER JOIN ${rolesRef} r ON u.role_id = r.id
            WHERE lower(r.name) IN ('cashier', 'manager', 'admin', 'pharmacist')
              AND u.pin_hash IS NOT NULL
          `;

      let matched: (typeof candidates)[0] | null = null;
      for (const row of candidates) {
        const ok = await bcrypt.compare(input.pin, row.pin_hash);
        if (ok) {
          matched = row;
          break;
        }
      }

      if (!matched) {
        throw new UnauthorizedException(
          'Invalid PIN or staff ID (ensure POS PIN is set on this user, not only the web password)',
        );
      }
      if (!matched.branch_id) {
        throw new UnauthorizedException(
          'Branch assignment is required for POS sign-in',
        );
      }
      if (input.branchId && input.branchId !== matched.branch_id) {
        throw new UnauthorizedException('Access denied to this branch');
      }

      const resolvedRole = matched.role_name.trim().toLowerCase();
      const permissionCodes = await this.loadTenantPermissionCodes(
        tenant.schemaName,
        matched.id,
      );

      const token = await this.signToken(
        {
          sub: matched.id,
          role: resolvedRole,
          type: 'tenant_user',
          tenantSchema: tenant.schemaName,
          tenantId: tenant.id,
          authMode: 'pin',
          canViewAllBranches: false,
          permissions: permissionCodes,
        },
        this.cashierJwtSignOptions(),
      );

      const defaultBranchId = matched.branch_id;

      return {
        user: {
          id: matched.id,
          email: matched.email ?? '',
          name: matched.name,
        },
        token,
        userId: matched.id,
        role: resolvedRole,
        tenantId: tenant.id,
        tenantSlug: tenant.schemaName,
        userType: 'tenant',
        defaultBranchId,
        assignedBranchId: matched.branch_id,
        allowedBranchIds: matched.branch_id ? [matched.branch_id] : [],
        canViewAllBranches: false,
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
    this.assertStaffLoginNotLocked(lockKey);

    await this.tenantService.applyTenantSchemaPatches(device.tenantSchema);

    const matched = await this.prisma.withTenantSchema(
      device.tenantSchema,
      async (tx) => {
        const [row] = await tx.$queryRawUnsafe<
          {
            id: string;
            email: string | null;
            name: string | null;
            pin_hash: string;
            branch_id: string | null;
            role_name: string;
          }[]
        >(
          `SELECT u.id, u.email, u.name, u.pin_hash, u.branch_id,
                  lower(r.name) AS role_name
           FROM "${device.tenantSchema}"."users" u
           INNER JOIN "${device.tenantSchema}"."roles" r ON u.role_id = r.id
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
      this.registerStaffLoginFailure(lockKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    const pinMatches = await bcrypt.compare(input.pin, matched.pin_hash);
    if (!pinMatches) {
      this.registerStaffLoginFailure(lockKey);
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

    this.clearStaffLoginFailures(lockKey);
    await this.touchPosDevice(device.id);

    const resolvedRole = matched.role_name.trim().toLowerCase();
    const permissionCodes = await this.loadTenantPermissionCodes(
      device.tenantSchema,
      matched.id,
    );

    const token = await this.signToken(
      {
        sub: matched.id,
        role: resolvedRole,
        type: 'tenant_user',
        tenantSchema: device.tenantSchema,
        tenantId: device.tenantId,
        authMode: 'device_pin',
        posDeviceId: device.id,
        canViewAllBranches: false,
        permissions: permissionCodes,
      },
      this.cashierJwtSignOptions(),
    );

    return {
      user: {
        id: matched.id,
        email: matched.email ?? '',
        name: matched.name,
      },
      token,
      userId: matched.id,
      role: resolvedRole,
      tenantId: device.tenantId,
      tenantSlug: device.tenantSchema,
      userType: 'tenant',
      defaultBranchId: matched.branch_id,
      assignedBranchId: matched.branch_id,
      allowedBranchIds: [matched.branch_id],
      canViewAllBranches: false,
      permissions: permissionCodes,
    };
  }

  async enrollPosDevice(input: {
    tenant: string;
    email: string;
    password: string;
    deviceCode?: string;
    displayName?: string;
    branchId?: string;
  }) {
    const loginRes = await this.login({
      email: input.email,
      password: input.password,
      tenant: input.tenant,
    });
    if (loginRes.userType !== 'tenant') {
      throw new UnauthorizedException(
        'Only tenant managers can enroll POS devices',
      );
    }
    const role = normalizeRole(loginRes.role);
    if (!['admin', 'manager'].includes(role)) {
      throw new UnauthorizedException(
        'Only admin or manager can enroll POS devices',
      );
    }
    if (!loginRes.tenantId || !loginRes.tenantSlug) {
      throw new UnauthorizedException('Tenant context is required');
    }

    const trimmedCode = input.deviceCode?.trim();
    const deviceCode =
      trimmedCode && trimmedCode.length > 0
        ? trimmedCode
        : `POS-${randomUUID()}`;
    const secret = randomBytes(32).toString('hex');
    const secretHash = this.hashDeviceSecret(secret);
    const displayName = input.displayName?.trim() || null;
    const branchId = input.branchId ?? null;

    const [existing] = await this.prisma.$queryRawUnsafe<
      { id: string; tenant_id: string }[]
    >(
      `SELECT id, tenant_id
       FROM "public"."pos_devices"
       WHERE device_code = $1
       LIMIT 1`,
      deviceCode,
    );

    let deviceId = existing?.id;
    if (existing) {
      if (existing.tenant_id !== loginRes.tenantId) {
        throw new BadRequestException(
          'Device code is already assigned to another tenant',
        );
      }
      await this.prisma.$executeRawUnsafe(
        `UPDATE "public"."pos_devices"
         SET display_name = $1,
             status = 'active',
             device_secret_hash = $2,
             branch_id = $3,
             bound_at = CURRENT_TIMESTAMP,
             revoked_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        displayName,
        secretHash,
        branchId,
        existing.id,
      );
    } else {
      const inserted = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "public"."pos_devices" (
            tenant_id,
            device_code,
            display_name,
            status,
            device_secret_hash,
            branch_id,
            bound_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, 'active', $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id`,
        loginRes.tenantId,
        deviceCode,
        displayName,
        secretHash,
        branchId,
      );
      deviceId = inserted[0]?.id;
    }

    if (!deviceId) {
      throw new BadRequestException('Failed to enroll device');
    }

    return {
      deviceId,
      deviceCode,
      displayName,
      branchId,
      status: 'active' as const,
      tenantId: loginRes.tenantId,
      tenantSlug: loginRes.tenantSlug,
      enrolledByUserId: loginRes.userId,
      deviceCredential: this.encodeDeviceCredential(deviceId, secret),
    };
  }

  async revokePosDevice(input: {
    tenant: string;
    email: string;
    password: string;
    deviceCode: string;
  }) {
    const loginRes = await this.login({
      email: input.email,
      password: input.password,
      tenant: input.tenant,
    });
    if (loginRes.userType !== 'tenant') {
      throw new UnauthorizedException(
        'Only tenant managers can revoke devices',
      );
    }
    const role = normalizeRole(loginRes.role);
    if (!['admin', 'manager'].includes(role)) {
      throw new UnauthorizedException(
        'Only admin or manager can revoke POS devices',
      );
    }
    if (!loginRes.tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }

    const code = input.deviceCode.trim();
    if (!code) {
      throw new BadRequestException('Device code is required');
    }

    const updated = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; status: string }>
    >(
      `UPDATE "public"."pos_devices"
       SET status = 'revoked',
           revoked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1
         AND device_code = $2
       RETURNING id, status`,
      loginRes.tenantId,
      code,
    );

    if (!updated[0]) {
      throw new BadRequestException('Device not found for this tenant');
    }

    return {
      deviceId: updated[0].id,
      deviceCode: code,
      status: updated[0].status,
      revoked: true,
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
    const tenants = await this.tenantService.findAll();
    const activeTenants = tenants.filter((t) => t.status === 'active');

    for (const tenant of activeTenants) {
      const [row] = await this.prisma.queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "${tenant.schemaName}"."users" WHERE email = $1 LIMIT 1`,
        email,
      );
      if (row) {
        return {
          id: tenant.id,
          schemaName: tenant.schemaName,
          name: tenant.name,
        };
      }
    }
    return null;
  }

  private async resolvePosDeviceFromCredential(deviceCredential: string) {
    const parsed = this.decodeDeviceCredential(deviceCredential);
    if (!parsed) {
      throw new UnauthorizedException('Invalid device credential');
    }
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenant_id: string;
        device_code: string;
        status: string;
        device_secret_hash: string;
        branch_id: string | null;
        tenant_schema_name: string;
        tenant_status: string;
      }>
    >(
      `SELECT d.id,
              d.tenant_id,
              d.device_code,
              d.status,
              d.device_secret_hash,
              d.branch_id,
              t.schema_name AS tenant_schema_name,
              t.status AS tenant_status
       FROM "public"."pos_devices" d
       INNER JOIN "public"."tenants" t ON t.id = d.tenant_id
       WHERE d.id = $1
       LIMIT 1`,
      parsed.deviceId,
    );

    if (!row) {
      throw new UnauthorizedException('Invalid device credential');
    }
    if (row.status !== 'active' || row.tenant_status !== 'active') {
      throw new UnauthorizedException('Device is not active');
    }

    const expected = this.hashDeviceSecret(parsed.deviceSecret);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(row.device_secret_hash, 'utf8');
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('Invalid device credential');
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      tenantSchema: row.tenant_schema_name,
      deviceCode: row.device_code,
      branchId: row.branch_id,
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

  private assertStaffLoginNotLocked(lockKey: string): void {
    const existing = this.staffLoginLockState.get(lockKey);
    if (!existing) return;
    const now = Date.now();
    if (existing.lockUntil > now) {
      throw new UnauthorizedException(
        'Too many failed attempts. Please wait before retrying.',
      );
    }
    if (now - existing.lastFailedAt > this.staffLoginLockWindowMs) {
      this.staffLoginLockState.delete(lockKey);
    }
  }

  private registerStaffLoginFailure(lockKey: string): void {
    const now = Date.now();
    const existing = this.staffLoginLockState.get(lockKey);
    const shouldResetWindow =
      !existing || now - existing.lastFailedAt > this.staffLoginLockWindowMs;
    const failures = shouldResetWindow ? 1 : existing.failures + 1;
    const lockUntil =
      failures >= this.staffLoginMaxFailures
        ? now + this.staffLoginLockWindowMs
        : 0;
    this.staffLoginLockState.set(lockKey, {
      failures,
      lockUntil,
      lastFailedAt: now,
    });
  }

  private clearStaffLoginFailures(lockKey: string): void {
    this.staffLoginLockState.delete(lockKey);
  }

  private isDeviceLoginEnforcedForTenant(tenantSlug: string): boolean {
    const mode =
      this.config.get<string>('POS_DEVICE_LOGIN_MODE')?.trim().toLowerCase() ??
      'dual';
    if (mode === 'legacy') return false;
    if (mode === 'device') return true;
    const requiredSlugs =
      this.config.get<string>('POS_DEVICE_ENFORCED_TENANTS') ?? '';
    const enforced = new Set(
      requiredSlugs
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    return enforced.has(tenantSlug.trim().toLowerCase());
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

    const insertedRows = await this.createFirstTenantUser(tenant.schemaName, {
      name: input.owner_name,
      email: input.email,
      password: input.password,
    });
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
    return this.prisma.withTenantSchema(schemaName, async () => {
      const existing = await this.prisma.queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "${schemaName}"."users" WHERE email = $1`,
        input.email,
      );
      if (existing.length > 0) {
        throw new BadRequestException('Email already in use for this pharmacy');
      }
      const inserted = await this.prisma.queryRawUnsafe<
        { id: string; email: string; name: string | null }[]
      >(
        `INSERT INTO "${schemaName}"."users" (name, email, password, role_id)
         VALUES ($1, $2, $3, (SELECT id FROM "${schemaName}"."roles" WHERE name = 'admin'))
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

    return this.prisma.withTenantSchema(schemaName, async () => {
      const existing = await this.prisma.queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "${schemaName}"."users" WHERE email = $1`,
        input.email,
      );

      if (existing.length > 0) {
        throw new BadRequestException('Email already in use');
      }

      const hashed = await bcrypt.hash(input.password, 10);

      const roleName = input.roleName ?? 'admin';

      const [inserted] = await this.prisma.queryRawUnsafe<
        { id: string; email: string; name: string | null }[]
      >(
        `INSERT INTO "${schemaName}"."users" (name, email, password, role_id)
         VALUES (
           $1,
           $2,
           $3,
           (SELECT id FROM "${schemaName}"."roles" WHERE name = $4)
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

    return this.prisma.withTenantSchema(schemaName, async () => {
      const [user] = await this.prisma.queryRawUnsafe<
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
         FROM "${schemaName}"."users" u
         LEFT JOIN "${schemaName}"."roles" r ON u.role_id = r.id
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
}
