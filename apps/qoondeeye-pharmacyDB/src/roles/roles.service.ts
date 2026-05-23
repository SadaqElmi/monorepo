import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveRolesCacheTtlMs } from '../cache/cache-catalog.config';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { catalogListCacheKey } from '../cache/cache-keys';
import { catalogTenantTags } from '../cache/cache-tags';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import { PrismaService } from '../prisma/prisma.service';

export type RoleWithPermissions = {
  id: string;
  name: string;
  permissions: string[];
  createdAt: Date | null;
};

type RoleListRow = {
  id: string;
  name: string;
  permissions: string[] | null;
};

@Injectable()
export class RolesService {
  private readonly rolesTtlMs = resolveRolesCacheTtlMs();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taggedCache: TaggedCacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  private normalizePermissions(input: string[] | undefined) {
    return (input ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  }

  private async ensurePermissionsExist(
    tx: Prisma.TransactionClient,
    names: string[],
  ) {
    if (names.length === 0) return [];

    await tx.permission.createMany({
      data: names.map((name) => ({ name })),
      skipDuplicates: true,
    });

    return tx.permission.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
  }

  private mapRoleRows(rows: RoleListRow[]): RoleWithPermissions[] {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      permissions: Array.isArray(row.permissions)
        ? row.permissions.filter(Boolean)
        : [],
      createdAt: null,
    }));
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
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<RoleListRow[]>(
        `SELECT r.id, r.name,
                COALESCE(
                  array_agg(DISTINCT p.name ORDER BY p.name)
                    FILTER (WHERE p.name IS NOT NULL),
                  '{}'
                ) AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
         GROUP BY r.id, r.name
         ORDER BY r.name`,
      ),
    );
    return this.mapRoleRows(rows);
  }

  async create(
    schemaName: string,
    tenantId: string,
    input: { name: string; permissions: string[] },
  ): Promise<RoleWithPermissions> {
    const result = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const permissionNames = this.normalizePermissions(input.permissions);
      const role = await tx.role.create({
        data: { name: input.name },
      });

      if (permissionNames.length) {
        const permissions = await this.ensurePermissionsExist(
          tx,
          permissionNames,
        );

        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: role.id,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }

      const [row] = await tx.$queryRawUnsafe<RoleListRow[]>(
        `SELECT r.id, r.name,
                COALESCE(
                  array_agg(DISTINCT p.name ORDER BY p.name)
                    FILTER (WHERE p.name IS NOT NULL),
                  '{}'
                ) AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
         WHERE r.id = $1::uuid
         GROUP BY r.id, r.name`,
        role.id,
      );
      return this.mapRoleRows(row ? [row] : [])[0]!;
    });
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return result;
  }

  async update(
    schemaName: string,
    tenantId: string,
    id: string,
    input: { name?: string; permissions?: string[] },
  ): Promise<RoleWithPermissions | null> {
    const result = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const existing = await tx.role.findUnique({ where: { id } });
      if (!existing) return null;

      if (input.name && input.name !== existing.name) {
        await tx.role.update({
          where: { id },
          data: { name: input.name },
        });
      }

      if (input.permissions) {
        const permissionNames = this.normalizePermissions(input.permissions);
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        });

        if (permissionNames.length) {
          const permissions = await this.ensurePermissionsExist(
            tx,
            permissionNames,
          );

          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({
              roleId: id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      const [row] = await tx.$queryRawUnsafe<RoleListRow[]>(
        `SELECT r.id, r.name,
                COALESCE(
                  array_agg(DISTINCT p.name ORDER BY p.name)
                    FILTER (WHERE p.name IS NOT NULL),
                  '{}'
                ) AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
         WHERE r.id = $1::uuid
         GROUP BY r.id, r.name`,
        id,
      );
      return row ? this.mapRoleRows([row])[0]! : null;
    });
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return result;
  }

  async remove(
    schemaName: string,
    tenantId: string,
    id: string,
  ): Promise<{ deleted: boolean }> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });
      await tx.role.delete({
        where: { id },
      });
    });
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return { deleted: true };
  }
}
