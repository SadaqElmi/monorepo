import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type RoleWithPermissions = {
  id: string;
  name: string;
  permissions: string[];
  createdAt: Date | null;
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePermissions(input: string[] | undefined) {
    return (input ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  }

  private async ensurePermissionsExist(
    tx: Prisma.TransactionClient,
    names: string[],
  ) {
    if (names.length === 0) return [];

    // Create any missing permissions (idempotent).
    await tx.permission.createMany({
      data: names.map((name) => ({ name })),
      skipDuplicates: true,
    });

    return tx.permission.findMany({
      where: { name: { in: names } },
    });
  }

  async findAll(schemaName: string): Promise<RoleWithPermissions[]> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const roles = await tx.role.findMany({
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      return roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.rolePermissions.map((rp) => rp.permission.name),
        createdAt: null,
      }));
    });
  }

  async create(
    schemaName: string,
    input: { name: string; permissions: string[] },
  ): Promise<RoleWithPermissions> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const permissionNames = this.normalizePermissions(input.permissions);
      const role = await tx.role.create({
        data: {
          name: input.name,
        },
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

      const full = await tx.role.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      return {
        id: full!.id,
        name: full!.name,
        permissions: full!.rolePermissions.map((rp) => rp.permission.name),
        createdAt: null,
      };
    });
  }

  async update(
    schemaName: string,
    id: string,
    input: { name?: string; permissions?: string[] },
  ): Promise<RoleWithPermissions | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
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

      const full = await tx.role.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      if (!full) return null;

      return {
        id: full.id,
        name: full.name,
        permissions: full.rolePermissions.map((rp) => rp.permission.name),
        createdAt: null,
      };
    });
  }

  async remove(schemaName: string, id: string): Promise<{ deleted: boolean }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });
      await tx.role.delete({
        where: { id },
      });
      return { deleted: true };
    });
  }
}
