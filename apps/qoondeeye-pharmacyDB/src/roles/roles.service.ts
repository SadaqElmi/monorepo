import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveRolesCacheTtlMs } from '../cache/cache-catalog.config';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { catalogListCacheKey } from '../cache/cache-keys';
import { catalogTenantTags } from '../cache/cache-tags';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import {
  assertKnownPermissions,
  isKnownPermission,
  SYSTEM_ROLE_NAMES,
} from '../common/security/permission-catalog';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

export type RoleWithPermissions = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystemRole: boolean;
  permissions: string[];
  userCount: number;
  createdAt: string | null;
};

type RoleListRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  is_system_role: boolean;
  permissions: string[] | null;
  user_count: number | string;
};

@Injectable()
export class RolesService {
  private readonly rolesTtlMs = resolveRolesCacheTtlMs();
  private readonly userCountJoinCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taggedCache: TaggedCacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly tenantService: TenantService,
  ) {}

  private async ensureRolesSchema(schemaName: string): Promise<void> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
  }

  private async tenantColumnExists(
    schemaName: string,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = $2
            AND column_name = $3
        ) AS ok
        `,
        'public',
        tableName,
        columnName,
      ),
    );
    return Boolean(row?.ok);
  }

  private async resolveUserCountJoin(schemaName: string): Promise<string> {
    const cached = this.userCountJoinCache.get(schemaName);
    if (cached !== undefined) return cached;

    const hasRoleId = await this.tenantColumnExists(
      schemaName,
      'users',
      'role_id',
    );
    let join = '';
    if (hasRoleId) {
      join = `LEFT JOIN (
              SELECT role_id, COUNT(*)::int AS cnt
              FROM users
              WHERE role_id IS NOT NULL
              GROUP BY role_id
            ) u ON u.role_id = r.id`;
    } else {
      const hasRoleText = await this.tenantColumnExists(
        schemaName,
        'users',
        'role',
      );
      if (hasRoleText) {
        join = `LEFT JOIN (
                SELECT lower(trim(role)) AS role_key, COUNT(*)::int AS cnt
                FROM users
                WHERE role IS NOT NULL AND trim(role) <> ''
                GROUP BY lower(trim(role))
              ) u ON u.role_key = lower(trim(r.name))`;
      }
    }

    this.userCountJoinCache.set(schemaName, join);
    return join;
  }

  private normalizePermissions(input: string[] | undefined): string[] {
    const names = (input ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
    const unknown = names.filter((n) => !isKnownPermission(n));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown permission codes: ${unknown.join(', ')}`,
      );
    }
    return [...new Set(names)];
  }

  private mapRoleRows(rows: RoleListRow[]): RoleWithPermissions[] {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      active: row.active !== false,
      isSystemRole: Boolean(row.is_system_role),
      permissions: Array.isArray(row.permissions)
        ? row.permissions.filter(Boolean)
        : [],
      userCount: Number(row.user_count ?? 0),
      createdAt: null,
    }));
  }

  private async roleSelectSql(
    schemaName: string,
    options: { where?: string; orderBy?: string } = {},
  ): Promise<string> {
    const userCountJoin = await this.resolveUserCountJoin(schemaName);
    const userCountExpr = userCountJoin ? 'COALESCE(u.cnt, 0)' : '0';
    const groupUserCount = userCountJoin ? ', u.cnt' : '';
    const where = options.where ? `${options.where}\n            ` : '';
    const orderBy = options.orderBy ? `\n            ${options.orderBy}` : '';
    return `SELECT r.id, r.name, r.description, COALESCE(r.active, true) AS active,
                   COALESCE(r.is_system_role, false) AS is_system_role,
                   COALESCE(
                     array_agg(DISTINCT p.name ORDER BY p.name)
                       FILTER (WHERE p.name IS NOT NULL),
                     '{}'
                   ) AS permissions,
                   ${userCountExpr} AS user_count
            FROM roles r
            LEFT JOIN role_permissions rp ON rp.role_id = r.id
            LEFT JOIN permissions p ON p.id = rp.permission_id
            ${userCountJoin}
            ${where}GROUP BY r.id, r.name, r.description, r.active, r.is_system_role${groupUserCount}${orderBy}`;
  }

  private async syncRolePermissions(
    schemaName: string,
    roleId: string,
    permissionNames: string[],
  ): Promise<void> {
    await this.ensureRolesSchema(schemaName);
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM role_permissions WHERE role_id = $1::uuid`,
        roleId,
      );
      if (!permissionNames.length) return;
      for (const name of permissionNames) {
        await tx.$executeRawUnsafe(
          `INSERT INTO permissions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
          name,
        );
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1::uuid, p.id
         FROM permissions p
         WHERE p.name = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        roleId,
        permissionNames,
      );
    });
  }

  async findAll(
    schemaName: string,
    tenantId: string,
  ): Promise<RoleWithPermissions[]> {
    const key = catalogListCacheKey(tenantId, 'all', 'roles');
    const tags = catalogTenantTags(tenantId);
    return this.taggedCache.getOrSet(key, tags, this.rolesTtlMs, () =>
      this.findAllUncached(schemaName),
    );
  }

  private async findAllUncached(
    schemaName: string,
  ): Promise<RoleWithPermissions[]> {
    await this.ensureRolesSchema(schemaName);
    const sql = await this.roleSelectSql(schemaName, {
      orderBy: 'ORDER BY r.name',
    });
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<RoleListRow[]>(sql),
    );
    return this.mapRoleRows(rows);
  }

  private async findOneById(
    schemaName: string,
    id: string,
  ): Promise<RoleWithPermissions | null> {
    await this.ensureRolesSchema(schemaName);
    const sql = await this.roleSelectSql(schemaName, {
      where: 'WHERE r.id = $1::uuid',
    });
    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<RoleListRow[]>(sql, id),
    );
    return row ? this.mapRoleRows([row])[0]! : null;
  }

  async create(
    schemaName: string,
    tenantId: string,
    input: {
      name: string;
      description?: string | null;
      active?: boolean;
      permissions: string[];
    },
  ): Promise<RoleWithPermissions> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Role name is required');
    const permissionNames = this.normalizePermissions(input.permissions);
    assertKnownPermissions(permissionNames);
    await this.ensureRolesSchema(schemaName);

    const [inserted] = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO roles (name, description, active, is_system_role)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
        name,
        input.description?.trim() || null,
        input.active !== false,
      );
      return rows;
    });

    await this.syncRolePermissions(schemaName, inserted!.id, permissionNames);
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return (await this.findOneById(schemaName, inserted!.id))!;
  }

  async clone(
    schemaName: string,
    tenantId: string,
    sourceId: string,
    input: { name: string; description?: string | null },
  ): Promise<RoleWithPermissions> {
    const source = await this.findOneById(schemaName, sourceId);
    if (!source) throw new NotFoundException('Role not found');
    return this.create(schemaName, tenantId, {
      name: input.name,
      description: input.description ?? source.description,
      active: true,
      permissions: source.permissions,
    });
  }

  async update(
    schemaName: string,
    tenantId: string,
    id: string,
    input: {
      name?: string;
      description?: string | null;
      active?: boolean;
      permissions?: string[];
    },
  ): Promise<RoleWithPermissions | null> {
    const existing = await this.findOneById(schemaName, id);
    if (!existing) return null;

    if (existing.isSystemRole && input.name && input.name !== existing.name) {
      throw new ConflictException('System roles cannot be renamed');
    }

    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      let idx = 2;
      if (input.name && !existing.isSystemRole) {
        sets.push(`name = $${idx++}`);
        params.push(input.name.trim());
      }
      if (input.description !== undefined) {
        sets.push(`description = $${idx++}`);
        params.push(input.description?.trim() || null);
      }
      if (input.active !== undefined) {
        sets.push(`active = $${idx++}`);
        params.push(input.active);
      }
      if (sets.length) {
        await tx.$executeRawUnsafe(
          `UPDATE roles SET ${sets.join(', ')} WHERE id = $1::uuid`,
          ...params,
        );
      }
    });

    if (input.permissions) {
      const permissionNames = this.normalizePermissions(input.permissions);
      assertKnownPermissions(permissionNames);
      await this.syncRolePermissions(schemaName, id, permissionNames);
    }

    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return this.findOneById(schemaName, id);
  }

  async remove(
    schemaName: string,
    tenantId: string,
    id: string,
  ): Promise<{ deleted: boolean }> {
    const existing = await this.findOneById(schemaName, id);
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystemRole) {
      throw new ConflictException('System roles cannot be deleted');
    }
    if (existing.userCount > 0) {
      throw new ConflictException(
        'Role is assigned to staff and cannot be deleted',
      );
    }

    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM role_permissions WHERE role_id = $1::uuid`,
        id,
      );
      await tx.$executeRawUnsafe(`DELETE FROM roles WHERE id = $1::uuid`, id);
    });
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return { deleted: true };
  }

  isSystemRoleName(name: string): boolean {
    return (SYSTEM_ROLE_NAMES as readonly string[]).includes(
      name.trim().toLowerCase(),
    );
  }
}
