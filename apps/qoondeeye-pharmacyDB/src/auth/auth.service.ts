import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../common/security/branch-access.policy';
import { ALL_ACCOUNTING_PERMISSIONS } from '../common/security/accounting-permissions';

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
      if (
        permissionCodes.length === 0 &&
        (roleLower === 'admin' || roleLower === 'manager')
      ) {
        permissionCodes = [...ALL_ACCOUNTING_PERMISSIONS];
      }

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
              `SELECT id FROM branches ORDER BY name`,
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

  /** Cashier login: PIN + tenant slug (optional branch). */
  async pinLogin(input: {
    pin: string;
    tenant: string;
    branchId?: string;
  }): Promise<LoginResponse> {
    const slug = input.tenant.trim();
    const anyTenant = await this.tenantService.findBySchemaNameAny(slug);
    if (!anyTenant || anyTenant.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tenant = {
      id: anyTenant.id,
      schemaName: anyTenant.schemaName,
      name: anyTenant.name,
    };

    // Public auth routes skip tenant middleware; ensure live tenant schemas have `pin_hash`, etc.
    await this.tenantService.applyTenantSchemaPatches(tenant.schemaName);

    return this.prisma.withTenantSchema(tenant.schemaName, async (tx) => {
      // Match PIN against all cashiers who have a PIN (tenant-wide; staff enforces unique PIN).
      // Do not filter by branch here.
      const candidates = await tx.$queryRawUnsafe<
        {
          id: string;
          email: string | null;
          name: string | null;
          pin_hash: string;
          branch_id: string | null;
        }[]
      >(
        `SELECT u.id, u.email, u.name, u.pin_hash, u.branch_id
         FROM "${tenant.schemaName}"."users" u
         INNER JOIN "${tenant.schemaName}"."roles" r ON u.role_id = r.id
         WHERE lower(r.name) = 'cashier'
           AND u.pin_hash IS NOT NULL`,
      );

      let matched: (typeof candidates)[0] | null = null;
      for (const row of candidates) {
        const ok = await bcrypt.compare(input.pin, row.pin_hash);
        if (ok) {
          matched = row;
          break;
        }
      }

      if (!matched) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (!matched.branch_id) {
        throw new UnauthorizedException(
          'Cashier branch assignment is required',
        );
      }
      if (input.branchId && input.branchId !== matched.branch_id) {
        throw new UnauthorizedException('Access denied to this branch');
      }

      const token = await this.signToken(
        {
          sub: matched.id,
          role: 'cashier',
          type: 'tenant_user',
          tenantSchema: tenant.schemaName,
          tenantId: tenant.id,
          authMode: 'pin',
          canViewAllBranches: false,
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
        role: 'cashier',
        tenantId: tenant.id,
        tenantSlug: tenant.schemaName,
        userType: 'tenant',
        defaultBranchId,
        assignedBranchId: matched.branch_id,
        allowedBranchIds: matched.branch_id ? [matched.branch_id] : [],
        canViewAllBranches: false,
        permissions: [],
      };
    });
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
      permissions:
        permissionCodes.length > 0
          ? permissionCodes
          : [...ALL_ACCOUNTING_PERMISSIONS],
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
      permissions:
        permissionCodes.length > 0
          ? permissionCodes
          : [...ALL_ACCOUNTING_PERMISSIONS],
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
      const rl = roleName.toLowerCase();
      if (
        permissionCodes.length === 0 &&
        (rl === 'admin' || rl === 'manager')
      ) {
        permissionCodes = [...ALL_ACCOUNTING_PERMISSIONS];
      }

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
