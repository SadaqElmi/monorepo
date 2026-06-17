import { ForbiddenException, Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuditLogService } from '../../accounting/audit-log.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantService } from '../../tenant/tenant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../security/branch-access.policy';
import { getAuthTokenFromHeaders } from '../security/auth-token.util';
import { ALL_ACCOUNTING_PERMISSIONS } from '../security/accounting-permissions';
import { requestPathname } from '../http/request-pathname';
import { tenantHasDedicatedDatabase } from '../../tenant/tenant-storage';
import { toTenantContextPayload } from '../../tenant/tenant.types';

type JwtPayload =
  | {
      sub: string;
      role: string;
      type: 'super_admin';
    }
  | {
      sub: string;
      role: string;
      type: 'tenant_user';
      tenantSchema?: string;
      tenantId?: string;
      canViewAllBranches?: boolean;
      permissions?: string[];
    };

function isMutationMethod(method: string | undefined): boolean {
  const m = (method ?? '').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

function isStaffApiRoute(path: string): boolean {
  const p = path.split('?')[0] ?? '';
  return p === '/api/staff' || /^\/api\/staff\/[^/]+$/.test(p);
}

function normalizeBranchId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s.length ? s : null;
}

function branchIdsFromRows(rows: { id: unknown }[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const id = normalizeBranchId(row.id);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Ship (source) / receive (destination): allowed for any tenant user with a branch; TransfersService enforces branch. */
function isStockTransferOperationalMutation(path: string): boolean {
  const p = path.split('?')[0] ?? '';
  return (
    /^\/api\/transfers\/?$/i.test(p) ||
    /^\/api\/transfers\/[^/]+\/?$/i.test(p) ||
    /^\/api\/transfers\/[^/]+\/confirm\/?$/i.test(p) ||
    /^\/api\/transfers\/[^/]+\/request-approval\/?$/i.test(p) ||
    /\/transfers\/[^/]+\/receive\/?$/i.test(p) ||
    /\/transfers\/[^/]+\/ship\/?$/i.test(p) ||
    /\/transfers\/[^/]+\/close\/?$/i.test(p)
  );
}

/** GET endpoints where any tenant user may use `x-branch-id: all` for read scope (Items UI). */
function isTenantWideReadAllBranchesRoute(fullPath: string): boolean {
  const p = fullPath.replace(/\/+$/, '') || '/';
  return (
    p === '/api/inventory' ||
    p === '/api/inventory/history' ||
    p === '/api/purchases/line-pricing-by-product'
  );
}

@Injectable()
export class BranchMiddleware implements NestMiddleware {
  private static ensuredSchemas = new Set<string>();

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Sync tenant schema from ALS or `req.tenant` (set by tenant middleware). */
  private resolveSchemaNameSync(req: FastifyRequest): string | null {
    const fromContext = this.tenantContext.getSchemaName();
    if (fromContext) return fromContext;
    const fromReq = req.tenant?.schema_name?.trim();
    if (!fromReq) return null;
    this.tenantContext.setTenant({
      id: req.tenant!.id,
      schemaName: fromReq,
      name: req.tenant!.name,
      status: 'active',
    });
    return fromReq;
  }

  /** Resolve tenant schema from ALS, `req.tenant`, or `X-Tenant` header. */
  private async ensureRequestSchemaName(
    req: FastifyRequest,
  ): Promise<string | null> {
    const sync = this.resolveSchemaNameSync(req);
    if (sync) return sync;

    const headerRaw =
      req.headers['x-tenant-subdomain'] ?? req.headers['x-tenant'];
    const slug =
      typeof headerRaw === 'string'
        ? headerRaw.trim()
        : Array.isArray(headerRaw)
          ? headerRaw[0]?.trim()
          : '';
    if (!slug) return null;

    const tenant =
      (await this.tenantService.findBySubdomain(slug)) ??
      (await this.tenantService.findBySchemaNameInsensitive(slug));
    if (!tenant) return null;

    this.tenantContext.setTenant(
      toTenantContextPayload({
        ...tenant,
        usesDedicatedDatabase: tenantHasDedicatedDatabase(tenant),
      }),
    );
    req.tenant = {
      id: tenant.id,
      schema_name: tenant.schemaName,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      database_name: tenant.databaseName,
      status: tenant.status,
    };
    return tenant.schemaName;
  }

  private async appendSecurityAudit(
    schemaName: string,
    params: {
      userId?: string | null;
      role?: string | null;
      branchId?: string | null;
      reason: string;
      path: string;
      method: string;
      sourceIp?: string | null;
    },
  ): Promise<void> {
    try {
      await this.auditLog.appendInSchema(schemaName, {
        branchId: params.branchId ?? null,
        actorUserId: params.userId ?? null,
        tableName: 'security_branch',
        recordId: '00000000-0000-0000-0000-000000000000',
        action: 'branch_access_denied',
        oldPayload: null,
        newPayload: {
          reason: params.reason,
          role: params.role ?? null,
          path: params.path,
          method: params.method,
          source_ip: params.sourceIp ?? null,
        },
        entityType: 'security',
        entityId: `${params.method}:${params.path}`,
      });
    } catch {
      // Best-effort telemetry; avoid blocking request flow on audit failures.
    }
  }

  private usesDedicatedTenantStorage(): boolean {
    return true;
  }

  private async ensureBranchIsolationColumns(schemaName: string) {
    if (this.usesDedicatedTenantStorage()) {
      return;
    }
    if (BranchMiddleware.ensuredSchemas.has(schemaName)) return;

    const checks: Array<{
      table: string;
      column: string;
      alterSql: string;
    }> = [
      {
        table: 'batches',
        column: 'branch_id',
        alterSql: `ALTER TABLE "batches"
                    ADD COLUMN branch_id UUID REFERENCES "branches"(id)`,
      },
      {
        table: 'products',
        column: 'branch_id',
        alterSql: `ALTER TABLE "products"
                    ADD COLUMN branch_id UUID REFERENCES "branches"(id)`,
      },
      {
        table: 'product_categories',
        column: 'branch_id',
        alterSql: `ALTER TABLE "product_categories"
                    ADD COLUMN branch_id UUID REFERENCES "branches"(id)`,
      },
      {
        table: 'product_categories',
        column: 'description',
        alterSql: `ALTER TABLE "product_categories"
                    ADD COLUMN description TEXT`,
      },
      {
        table: 'product_categories',
        column: 'slug',
        alterSql: `ALTER TABLE "product_categories"
                    ADD COLUMN slug VARCHAR(255)`,
      },
      {
        table: 'product_categories',
        column: 'parent_id',
        alterSql: `ALTER TABLE "product_categories"
                    ADD COLUMN parent_id UUID REFERENCES "product_categories"(id) ON DELETE SET NULL`,
      },
      {
        table: 'products',
        column: 'list_price',
        alterSql: `ALTER TABLE "products"
                    ADD COLUMN list_price NUMERIC(10,2)`,
      },
      {
        table: 'purchase_items',
        column: 'branch_id',
        alterSql: `ALTER TABLE "purchase_items"
                    ADD COLUMN branch_id UUID REFERENCES "branches"(id)`,
      },
      {
        table: 'purchase_items',
        column: 'batch_id',
        alterSql: `ALTER TABLE "purchase_items"
                    ADD COLUMN batch_id UUID REFERENCES "batches"(id)`,
      },
      {
        table: 'sale_items',
        column: 'branch_id',
        alterSql: `ALTER TABLE "sale_items"
                    ADD COLUMN branch_id UUID REFERENCES "branches"(id)`,
      },
      {
        table: 'cash_transactions',
        column: 'branch_id',
        alterSql: `ALTER TABLE "cash_transactions"
                    ADD COLUMN branch_id UUID REFERENCES "branches"(id)`,
      },
    ];

    for (const { table, column, alterSql } of checks) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = $2
            AND column_name = $3
        ) AS ok
        `,
        schemaName,
        table,
        column,
      );

      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "inventory"(product_id, branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_batches_fifo ON "batches"(branch_id, product_id, expiry_date, created_at)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS product_categories_parent_id_idx ON "product_categories"(parent_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_not_null ON "products"(barcode) WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "sale_returns" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "branches"(id),
        reason TEXT,
        return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON "sale_returns"(sale_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_date ON "sale_returns"(return_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "sale_return_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_return_id UUID REFERENCES "sale_returns"(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "products"(id),
        batch_id UUID REFERENCES "batches"(id),
        sale_item_id UUID REFERENCES "sale_items"(id),
        quantity INTEGER NOT NULL
      )`,
    );

    // product_categories.branch_id NULL = global (tenant-wide) category — do not backfill.
    // products.branch_id NULL = catalog-wide product — unchanged.

    BranchMiddleware.ensuredSchemas.add(schemaName);
  }

  /** Idempotent; used by {@link BranchScopeGuard} when middleware finishes after the handler. */
  async ensureBranchScopeForRequest(req: FastifyRequest): Promise<void> {
    if (req.allowedBranchIds?.length && req.userId) return;
    await this.applyBranchScope(req);
  }

  use(req: FastifyRequest, _res: unknown, next: () => void): void {
    if ((req.method ?? '').toUpperCase() === 'OPTIONS') {
      next();
      return;
    }
    void this.ensureBranchScopeForRequest(req)
      .then(() => next())
      .catch((err) => (next as (error?: unknown) => void)(err));
  }

  private async applyBranchScope(req: FastifyRequest): Promise<void> {
    // Keep these public routes branch-agnostic.
    const pathname = requestPathname(req);
    const isPublicRoute =
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/tenants') ||
      pathname.startsWith('/api/domains') ||
      pathname.startsWith('/api/system-users') ||
      pathname.startsWith('/api/admin/') ||
      pathname === '/api';
    if (isPublicRoute) return;

    // System host / system routes: no tenant, no branch filtering.
    if (req.isSystem) return;

    const earlyToken = getAuthTokenFromHeaders(req.headers);

    const schemaName =
      this.resolveSchemaNameSync(req) ??
      (await this.ensureRequestSchemaName(req));
    if (!schemaName) {
      if (earlyToken) {
        throw new BadRequestException(
          'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
        );
      }
      return;
    }

    const token = earlyToken;
    if (!token) {
      throw new ForbiddenException('Missing auth token');
    }

    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch {
      throw new ForbiddenException('Invalid auth token');
    }

    // Tenant token must match the resolved tenant schema.
    if (
      payload.type === 'tenant_user' &&
      typeof payload.tenantSchema === 'string' &&
      payload.tenantSchema.toLowerCase() !== schemaName.toLowerCase()
    ) {
      throw new ForbiddenException('Tenant mismatch');
    }

    const mutation = isMutationMethod(req.method);

    /** Super-admin impersonation: resolve branch scope for `X-Tenant` requests (e.g. `/api/staff`). */
    if (payload.type === 'super_admin') {
      const superUserId = payload.sub;
      const superRoleLower = normalizeRole(payload.role);
      const path = requestPathname(req);
      const headerBranchValueRaw = req.headers['x-branch-id'];
      const headerBranchValue =
        typeof headerBranchValueRaw === 'string'
          ? headerBranchValueRaw.trim()
          : undefined;

      const allBranchIds = branchIdsFromRows(
        await this.prisma.withTenantSchema(schemaName, (tx) =>
          tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM "branches" ORDER BY name`,
          ),
        ),
      );

      if (allBranchIds.length === 0) {
        const staffRoute = isStaffApiRoute(path);
        const staffRead = staffRoute && !mutation;
        const staffDelete =
          staffRoute &&
          mutation &&
          (req.method ?? '').toUpperCase() === 'DELETE';
        if (staffRead || staffDelete) {
          req.userId = superUserId;
          req.userRole = superRoleLower;
          req.userCanViewAllBranches = true;
          req.permissionCodes = [...ALL_ACCOUNTING_PERMISSIONS];
          req.isSuperAdmin = true;
          req.allowedBranchIds = [];
          req.branchReadScope = {
            readBranchIds: [],
            readAllBranches: staffRead,
            mutationBranchId: '',
          };
          return;
        }
        await this.appendSecurityAudit(schemaName, {
          userId: superUserId,
          role: superRoleLower,
          branchId: null,
          reason: 'no_branches_available_super_admin',
          path,
          method: req.method ?? 'UNKNOWN',
          sourceIp: req.ip ?? null,
        });
        throw new ForbiddenException('No branches available');
      }

      const isBranchSuperUser = true;
      const defaultBranchId = allBranchIds[0]!;
      const normalizedHeader = normalizeBranchId(headerBranchValue);
      const effectiveHeader =
        normalizedHeader &&
        normalizedHeader !== 'all' &&
        !allBranchIds.includes(normalizedHeader)
          ? null
          : normalizedHeader;
      const selectedBranchId = (() => {
        if (!effectiveHeader) return defaultBranchId;
        if (effectiveHeader === 'all') return defaultBranchId;
        return effectiveHeader;
      })();

      const allowedAllBranchesHeader = isBranchSuperUser;
      const viewAllRequested =
        effectiveHeader === 'all' && allowedAllBranchesHeader;

      const viewAllowedBranchIds = viewAllRequested
        ? allBranchIds
        : [selectedBranchId];
      const mutationAllowedBranchIds = isBranchSuperUser
        ? [selectedBranchId]
        : [defaultBranchId];

      req.branchId = mutationAllowedBranchIds[0]!;
      req.allowedBranchIds = mutation
        ? mutationAllowedBranchIds
        : viewAllowedBranchIds;
      req.branchReadScope = {
        readBranchIds: [...viewAllowedBranchIds],
        readAllBranches: !mutation && viewAllRequested,
        mutationBranchId: mutationAllowedBranchIds[0],
      };
      req.userId = superUserId;
      req.userRole = superRoleLower;
      req.userCanViewAllBranches = true;
      req.permissionCodes = [...ALL_ACCOUNTING_PERMISSIONS];
      req.isSuperAdmin = true;

      return;
    }

    // ------- Resolve user branch permissions -------
    const userId = payload.sub;
    const userRows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ branch_id: string | null }[]>(
        `SELECT branch_id FROM "users" WHERE id = $1::uuid`,
        userId,
      ),
    );

    const userBranchId = normalizeBranchId(userRows?.[0]?.branch_id);
    const roleLower = normalizeRole(payload.role);
    const isBranchSuperUser = hasGlobalBranchAccess(
      roleLower,
      payload.type === 'tenant_user' ? payload.canViewAllBranches : undefined,
    );

    const path = requestPathname(req);
    const headerBranchValueRaw = req.headers['x-branch-id'];
    const headerBranchValue =
      typeof headerBranchValueRaw === 'string'
        ? headerBranchValueRaw.trim()
        : undefined;

    const tenantWantsAllBranchesRead =
      !mutation &&
      headerBranchValue?.toLowerCase() === 'all' &&
      isTenantWideReadAllBranchesRoute(path);

    /** POS register + shift / statement / X-Z reports (`PosSessionsController` under `/api/pos`). */
    const isPosAppMutation =
      path === '/api/pos' || path.startsWith('/api/pos/');

    const cashierPosMutation =
      roleLower === 'cashier' &&
      mutation &&
      (isPosAppMutation ||
        [
          '/api/sales',
          '/api/sale-returns',
          '/api/return-vouchers',
          '/api/vouchers',
          '/api/transactions',
        ].some((p) => path === p || path.startsWith(`${p}/`)));

    const pharmacistPosMutation =
      roleLower === 'pharmacist' && mutation && isPosAppMutation;

    const transferOperationalMutation =
      mutation && isStockTransferOperationalMutation(path);

    // Phase 2: mutation access is enforced per-endpoint via PermissionGuard.
    // Branch middleware only enforces tenant auth + branch scope (below).
    void transferOperationalMutation;
    void cashierPosMutation;
    void pharmacistPosMutation;
    void isBranchSuperUser;

    /*
    if (
      mutation &&
      !isBranchSuperUser &&
      !cashierPosMutation &&
      !pharmacistPosMutation &&
      !transferOperationalMutation
    ) {
      await this.appendSecurityAudit(schemaName, {
        userId,
        role: roleLower,
        branchId: userBranchId,
        reason: 'crud_requires_admin_manager_or_pos_scope',
        path,
        method: req.method ?? 'UNKNOWN',
        sourceIp: req.ip ?? null,
      });
      throw new ForbiddenException(
        'Access denied: CRUD requires admin/manager',
      );
    }
    */

    // Branch superusers can view all branches; tenant-wide read allowlist loads the same list for scoped GETs.
    const needsTenantBranchList =
      isBranchSuperUser ||
      (tenantWantsAllBranchesRead && Boolean(userBranchId));
    const allBranchIds: string[] = needsTenantBranchList
      ? branchIdsFromRows(
          await this.prisma.withTenantSchema(schemaName, (tx) =>
            tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM "branches" ORDER BY name`,
            ),
          ),
        )
      : [];

    if (
      !isBranchSuperUser &&
      requiresAssignedBranch(roleLower) &&
      !userBranchId
    ) {
      await this.appendSecurityAudit(schemaName, {
        userId,
        role: roleLower,
        branchId: null,
        reason: 'missing_user_branch_assignment',
        path,
        method: req.method ?? 'UNKNOWN',
        sourceIp: req.ip ?? null,
      });
      throw new ForbiddenException('User does not have a branch assigned');
    }

    const hasBranches = isBranchSuperUser
      ? allBranchIds.length > 0
      : Boolean(userBranchId);

    if (!hasBranches) {
      await this.appendSecurityAudit(schemaName, {
        userId,
        role: roleLower,
        branchId: userBranchId,
        reason: 'no_branches_available',
        path,
        method: req.method ?? 'UNKNOWN',
        sourceIp: req.ip ?? null,
      });
      throw new ForbiddenException('No branches available');
    }

    const defaultBranchId = userBranchId
      ? userBranchId
      : isBranchSuperUser
        ? allBranchIds[0]
        : null;

    if (!defaultBranchId) {
      await this.appendSecurityAudit(schemaName, {
        userId,
        role: roleLower,
        branchId: userBranchId,
        reason: 'no_default_branch',
        path,
        method: req.method ?? 'UNKNOWN',
        sourceIp: req.ip ?? null,
      });
      throw new ForbiddenException('No default branch available');
    }

    const normalizedHeader = normalizeBranchId(headerBranchValue);
    const selectedBranchId = (() => {
      if (!normalizedHeader) return defaultBranchId;
      if (normalizedHeader === 'all') return defaultBranchId;
      return normalizedHeader;
    })();

    const allowedAllBranchesHeader =
      isBranchSuperUser ||
      (tenantWantsAllBranchesRead && Boolean(userBranchId));

    const viewAllRequested =
      normalizedHeader === 'all' && allowedAllBranchesHeader;

    // Enforce "selected branch" security before queries.
    if (!isBranchSuperUser) {
      if (!userBranchId) {
        await this.appendSecurityAudit(schemaName, {
          userId,
          role: roleLower,
          branchId: null,
          reason: 'missing_user_branch_assignment',
          path,
          method: req.method ?? 'UNKNOWN',
          sourceIp: req.ip ?? null,
        });
        throw new ForbiddenException('User does not have a branch assigned');
      }
      if (normalizedHeader === 'all' && !allowedAllBranchesHeader) {
        await this.appendSecurityAudit(schemaName, {
          userId,
          role: roleLower,
          branchId: userBranchId,
          reason: 'non_admin_requested_all_branches',
          path,
          method: req.method ?? 'UNKNOWN',
          sourceIp: req.ip ?? null,
        });
        throw new ForbiddenException('Access denied to all branches');
      }
      if (
        normalizedHeader &&
        normalizedHeader !== 'all' &&
        normalizedHeader !== userBranchId
      ) {
        await this.appendSecurityAudit(schemaName, {
          userId,
          role: roleLower,
          branchId: userBranchId,
          reason: 'branch_header_mismatch',
          path,
          method: req.method ?? 'UNKNOWN',
          sourceIp: req.ip ?? null,
        });
        throw new ForbiddenException('Access denied to this branch');
      }
    } else {
      // Superusers: if a specific branch is requested, ensure it exists in this tenant.
      if (
        normalizedHeader &&
        normalizedHeader !== 'all' &&
        !allBranchIds.includes(normalizedHeader)
      ) {
        await this.appendSecurityAudit(schemaName, {
          userId,
          role: roleLower,
          branchId: null,
          reason: 'admin_requested_unknown_branch',
          path,
          method: req.method ?? 'UNKNOWN',
          sourceIp: req.ip ?? null,
        });
        throw new ForbiddenException('Access denied to this branch');
      }
    }

    // Determine which branches we will allow for this request's queries.
    const viewAllowedBranchIds = viewAllRequested
      ? allBranchIds
      : [selectedBranchId];

    // For mutations we allow exactly one branch scope.
    // - Non-superusers: always defaultBranchId (their assigned branch).
    // - admin/manager: allow mutations for the selected branch (or default when `all`).
    const mutationAllowedBranchIds = isBranchSuperUser
      ? [selectedBranchId]
      : [defaultBranchId];

    req.branchId = mutationAllowedBranchIds[0]!;
    req.allowedBranchIds = mutation
      ? mutationAllowedBranchIds
      : viewAllowedBranchIds;
    req.branchReadScope = {
      readBranchIds: [...viewAllowedBranchIds],
      readAllBranches: !mutation && viewAllRequested,
      mutationBranchId: mutationAllowedBranchIds[0],
    };
    req.userId = userId;
    req.userRole = roleLower;
    req.userCanViewAllBranches = isBranchSuperUser;

    const jwtPerms =
      payload.type === 'tenant_user' &&
      Array.isArray((payload as { permissions?: string[] }).permissions)
        ? ((payload as { permissions?: string[] }).permissions ?? []).filter(
            (p): p is string => typeof p === 'string' && p.length > 0,
          )
        : [];
    let permissionCodes = jwtPerms;
    if (payload.type === 'tenant_user') {
      const fresh = await this.loadTenantPermissionCodes(schemaName, userId);
      if (fresh.length > 0) {
        permissionCodes = fresh;
      }
    }
    req.permissionCodes = permissionCodes;

  // Schema patches are non-blocking for request scope; run after branch context is set.
  void this.ensureBranchIsolationColumns(schemaName).catch(() => undefined);
  }

  /** Authoritative RBAC from DB (JWT permissions can be stale after new grants). */
  private async loadTenantPermissionCodes(
    schemaName: string,
    userId: string,
  ): Promise<string[]> {
    try {
      const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<Array<{ name: string }>>(
          `SELECT DISTINCT p.name AS name
           FROM "permissions" p
           INNER JOIN "role_permissions" rp ON rp.permission_id = p.id
           INNER JOIN "users" u ON u.role_id = rp.role_id
           WHERE u.id = $1::uuid`,
          userId,
        ),
      );
      return (rows ?? []).map((r) => r.name).filter(Boolean);
    } catch {
      return [];
    }
  }
}
