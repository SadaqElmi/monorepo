import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuditLogService } from '../../accounting/audit-log.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../security/branch-access.policy';
import { ALL_ACCOUNTING_PERMISSIONS } from '../security/accounting-permissions';

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

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1);
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

function isMutationMethod(method: string | undefined): boolean {
  const m = (method ?? '').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
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

/** Full pathname (includes global `/api` prefix). Nest mounts middleware under `/api`, so `req.path` may be `/sales` while the client called `/api/sales`. */
function tenantRequestPath(req: Request): string {
  const raw = (req.originalUrl ?? `${req.baseUrl ?? ''}${req.path ?? ''}`)
    .split('?')[0]
    ?.trim();
  if (raw?.startsWith('/')) return raw;
  return '/';
}

/** GET endpoints where any tenant user may use `x-branch-id: all` for read scope (Items UI). */
function isTenantWideReadAllBranchesRoute(fullPath: string): boolean {
  const p = fullPath.replace(/\/+$/, '') || '/';
  return (
    p === '/api/inventory' || p === '/api/purchases/line-pricing-by-product'
  );
}

@Injectable()
export class BranchMiddleware implements NestMiddleware {
  private static ensuredSchemas = new Set<string>();

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

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

  private async ensureBranchIsolationColumns(schemaName: string) {
    if (BranchMiddleware.ensuredSchemas.has(schemaName)) return;

    const checks: Array<{
      table: string;
      column: string;
      alterSql: string;
    }> = [
      {
        table: 'batches',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."batches"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'products',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."products"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'product_categories',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'product_categories',
        column: 'description',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
                    ADD COLUMN description TEXT`,
      },
      {
        table: 'product_categories',
        column: 'slug',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
                    ADD COLUMN slug VARCHAR(255)`,
      },
      {
        table: 'product_categories',
        column: 'parent_id',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
                    ADD COLUMN parent_id UUID REFERENCES "${schemaName}"."product_categories"(id) ON DELETE SET NULL`,
      },
      {
        table: 'products',
        column: 'list_price',
        alterSql: `ALTER TABLE "${schemaName}"."products"
                    ADD COLUMN list_price NUMERIC(10,2)`,
      },
      {
        table: 'purchase_items',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'purchase_items',
        column: 'batch_id',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
                    ADD COLUMN batch_id UUID REFERENCES "${schemaName}"."batches"(id)`,
      },
      {
        table: 'sale_items',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."sale_items"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'cash_transactions',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."cash_transactions"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
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
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "${schemaName}"."inventory"(product_id, branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_batches_fifo ON "${schemaName}"."batches"(branch_id, product_id, expiry_date, created_at)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS product_categories_parent_id_idx ON "${schemaName}"."product_categories"(parent_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_not_null ON "${schemaName}"."products"(barcode) WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_returns" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        reason TEXT,
        return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON "${schemaName}"."sale_returns"(sale_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_date ON "${schemaName}"."sale_returns"(return_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_return_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_return_id UUID REFERENCES "${schemaName}"."sale_returns"(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        sale_item_id UUID REFERENCES "${schemaName}"."sale_items"(id),
        quantity INTEGER NOT NULL
      )`,
    );

    // product_categories.branch_id NULL = global (tenant-wide) category — do not backfill.
    // products.branch_id NULL = catalog-wide product — unchanged.

    BranchMiddleware.ensuredSchemas.add(schemaName);
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Keep these public routes branch-agnostic.
    const isPublicRoute =
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/api/tenants') ||
      req.path.startsWith('/api/domains') ||
      req.path.startsWith('/api/system-users') ||
      req.path === '/api';
    if (isPublicRoute) return next();

    // System host / system routes: no tenant, no branch filtering.
    if (req.isSystem) return next();

    const schemaName = this.tenantContext.getSchemaName();
    if (!schemaName) return next();

    // Ensure the required branch_id columns exist for existing tenants.
    await this.ensureBranchIsolationColumns(schemaName);

    const cookieHeader = req.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const token = cookies['auth_token'];
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
      payload.tenantSchema !== schemaName
    ) {
      throw new ForbiddenException('Tenant mismatch');
    }

    const mutation = isMutationMethod(req.method);

    // If the token belongs to a system user, skip branch enforcement.
    if (payload.type === 'super_admin') return next();

    // ------- Resolve user branch permissions -------
    const userId = payload.sub;
    const userRow = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ branch_id: string | null }[]>(
        `SELECT branch_id FROM users WHERE id = $1`,
        userId,
      ),
    );

    const userBranchId: string | null = userRow?.[0]?.branch_id ?? null;
    const roleLower = normalizeRole(payload.role);
    const isBranchSuperUser = hasGlobalBranchAccess(
      roleLower,
      payload.type === 'tenant_user' ? payload.canViewAllBranches : undefined,
    );

    const path = tenantRequestPath(req);
    const headerBranchValueRaw = req.headers['x-branch-id'];
    const headerBranchValue =
      typeof headerBranchValueRaw === 'string'
        ? headerBranchValueRaw.trim()
        : undefined;

    const tenantWantsAllBranchesRead =
      !mutation &&
      headerBranchValue?.toLowerCase() === 'all' &&
      isTenantWideReadAllBranchesRoute(path);

    const cashierPosMutation =
      roleLower === 'cashier' &&
      mutation &&
      [
        '/api/sales',
        '/api/sale-returns',
        '/api/return-vouchers',
        '/api/vouchers',
        '/api/transactions',
      ].some((p) => path === p || path.startsWith(`${p}/`));

    const transferOperationalMutation =
      mutation && isStockTransferOperationalMutation(path);

    // Global CRUD restriction:
    // - Reads (GET) allowed for all tenant roles
    // - Mutations (POST/PATCH/DELETE) allowed for admin/manager, cashier on POS APIs, or
    //   any tenant user on operational transfer mutations (create/update/confirm/request-approval/ship/receive;
    //   branch enforced in TransfersService)
    if (
      mutation &&
      !isBranchSuperUser &&
      !cashierPosMutation &&
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

    // Branch superusers can view all branches; tenant-wide read allowlist loads the same list for scoped GETs.
    const needsTenantBranchList =
      isBranchSuperUser ||
      (tenantWantsAllBranchesRead && Boolean(userBranchId));
    const allBranchIds: string[] = needsTenantBranchList
      ? await this.prisma
          .withTenantSchema(schemaName, (tx) =>
            tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM branches ORDER BY name`,
            ),
          )
          .then((rows) => (rows ?? []).map((r) => r.id))
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

    const selectedBranchId = (() => {
      if (!headerBranchValue) return defaultBranchId;
      if (headerBranchValue.toLowerCase() === 'all') return defaultBranchId;
      return headerBranchValue;
    })();

    const allowedAllBranchesHeader =
      isBranchSuperUser ||
      (tenantWantsAllBranchesRead && Boolean(userBranchId));

    const viewAllRequested =
      headerBranchValue?.toLowerCase() === 'all' && allowedAllBranchesHeader;

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
      if (
        headerBranchValue?.toLowerCase() === 'all' &&
        !allowedAllBranchesHeader
      ) {
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
        headerBranchValue &&
        headerBranchValue.toLowerCase() !== 'all' &&
        headerBranchValue !== userBranchId
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
        headerBranchValue &&
        headerBranchValue.toLowerCase() !== 'all' &&
        !allBranchIds.includes(headerBranchValue)
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
    if (payload.type === 'tenant_user' && permissionCodes.length === 0) {
      if (roleLower === 'admin' || roleLower === 'manager') {
        permissionCodes = [...ALL_ACCOUNTING_PERMISSIONS];
      }
    }
    req.permissionCodes = permissionCodes;

    // `x-branch-id: all` is supported for superusers as a read scope. Mutations are still scoped to one branch.
    return next();
  }
}
