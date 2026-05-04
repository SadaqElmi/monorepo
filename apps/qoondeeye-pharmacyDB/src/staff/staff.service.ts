import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../common/security/branch-access.policy';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantUserTables(schemaName: string) {
    const [schemaRow] = await this.prisma.queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = $1
      ) as ok
      `,
      schemaName,
    );
    if (!schemaRow?.ok) {
      throw new Error(
        `Tenant schema "${schemaName}" does not exist. Create/provision the tenant schema first.`,
      );
    }

    const [userRow] = await this.prisma.queryRawUnsafe<
      { user_table: string | null; role_table: string | null }[]
    >(
      `
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name = 'users'
          ) THEN 'users'
          WHEN EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name = 'User'
          ) THEN '"User"'
          ELSE NULL
        END AS user_table,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name = 'roles'
          ) THEN 'roles'
          WHEN EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name = 'Role'
          ) THEN '"Role"'
          ELSE NULL
        END AS role_table
      `,
      schemaName,
    );

    const userTable = userRow?.user_table ?? null;
    if (!userTable) {
      throw new Error(
        `Tenant schema "${schemaName}" has no users table. Expected "users" or "User".`,
      );
    }

    const getHasColumn = async (tableName: string, columnName: string) => {
      const clean = tableName.replace(/"/g, '');
      const [row] = await this.prisma.queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS(
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = $2
            AND column_name = $3
        ) as ok
        `,
        schemaName,
        clean,
        columnName,
      );
      return Boolean(row?.ok);
    };

    const hasRoleId = await getHasColumn(userTable, 'role_id');
    const hasRoleText = await getHasColumn(userTable, 'role');
    const hasCreatedAt = await getHasColumn(userTable, 'created_at');
    const hasCreatedAtCamel = await getHasColumn(userTable, 'createdAt');
    const hasPinHash = await getHasColumn(userTable, 'pin_hash');
    const hasBranchId = await getHasColumn(userTable, 'branch_id');

    return {
      userTable,
      roleTable: userRow?.role_table ?? null,
      hasRoleId,
      hasRoleText,
      hasPinHash,
      hasBranchId,
      createdAtColumn: hasCreatedAt
        ? 'created_at'
        : hasCreatedAtCamel
          ? '"createdAt"'
          : null,
    };
  }

  /** Roles that may use POS PIN login (aligned with AuthService pin/staff login). */
  private static readonly POS_PIN_ROLES = new Set([
    'cashier',
    'manager',
    'admin',
    'pharmacist',
  ]);

  private canUsePosPin(roleLower: string): boolean {
    return StaffService.POS_PIN_ROLES.has(normalizeRole(roleLower));
  }

  /** Reject if another POS-eligible user in the tenant already uses this PIN. */
  private async assertPosPinUnique(
    schemaName: string,
    plainPin: string,
    excludeUserId?: string,
  ) {
    const rows = await this.prisma.queryRawUnsafe<
      { id: string; pin_hash: string }[]
    >(
      `SELECT u.id, u.pin_hash
       FROM "${schemaName}"."users" u
       INNER JOIN "${schemaName}"."roles" r ON u.role_id = r.id
       WHERE lower(r.name) IN ('cashier', 'manager', 'admin', 'pharmacist')
         AND u.pin_hash IS NOT NULL
         AND ($1::uuid IS NULL OR u.id <> $1::uuid)`,
      excludeUserId ?? null,
    );
    const bcrypt = await import('bcrypt');
    for (const row of rows) {
      if (await bcrypt.compare(plainPin, row.pin_hash)) {
        throw new BadRequestException(
          'This PIN is already in use by another staff member',
        );
      }
    }
  }

  async findAll(schemaName: string) {
    const meta = await this.resolveTenantUserTables(schemaName);
    const userTable = meta.userTable.startsWith('"')
      ? `"${schemaName}".${meta.userTable}`
      : `"${schemaName}".${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `"${schemaName}".${meta.roleTable}`
        : `"${schemaName}".${meta.roleTable}`);

    const createdAt = meta.createdAtColumn
      ? `u.${meta.createdAtColumn} AS created_at`
      : `NULL::timestamp AS created_at`;

    // Prefer role join if role_id + roles table exists; otherwise use text role column if present.
    if (meta.hasRoleId && roleTable) {
      return this.prisma.queryRawUnsafe(
        `SELECT u.id,
                u.name,
                u.staff_id,
                u.email,
                r.name AS role,
                u.branch_id,
                ${createdAt}
         FROM ${userTable} u
         LEFT JOIN ${roleTable} r ON u.role_id = r.id
         ORDER BY u.name`,
      );
    }

    if (meta.hasRoleText) {
      return this.prisma.queryRawUnsafe(
        `SELECT u.id,
                u.name,
                u.staff_id,
                u.email,
                u.role AS role,
                u.branch_id,
                ${createdAt}
         FROM ${userTable} u
         ORDER BY u.name`,
      );
    }

    return this.prisma.queryRawUnsafe(
      `SELECT u.id,
              u.name,
              u.staff_id,
              u.email,
              NULL::text AS role,
              u.branch_id,
              ${createdAt}
       FROM ${userTable} u
       ORDER BY u.name`,
    );
  }

  async findOne(schemaName: string, id: string) {
    const meta = await this.resolveTenantUserTables(schemaName);
    const userTable = meta.userTable.startsWith('"')
      ? `"${schemaName}".${meta.userTable}`
      : `"${schemaName}".${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `"${schemaName}".${meta.roleTable}`
        : `"${schemaName}".${meta.roleTable}`);

    const createdAt = meta.createdAtColumn
      ? `u.${meta.createdAtColumn} AS created_at`
      : `NULL::timestamp AS created_at`;

    let row: any = null;
    if (meta.hasRoleId && roleTable) {
      [row] = await this.prisma.queryRawUnsafe<any[]>(
        `SELECT u.id,
                u.name,
                u.staff_id,
                u.email,
                r.name AS role,
                u.branch_id,
                ${createdAt}
         FROM ${userTable} u
         LEFT JOIN ${roleTable} r ON u.role_id = r.id
         WHERE u.id = $1`,
        id,
      );
    } else if (meta.hasRoleText) {
      [row] = await this.prisma.queryRawUnsafe<any[]>(
        `SELECT u.id,
                u.name,
                u.staff_id,
                u.email,
                u.role AS role,
                u.branch_id,
                ${createdAt}
         FROM ${userTable} u
         WHERE u.id = $1`,
        id,
      );
    } else {
      [row] = await this.prisma.queryRawUnsafe<any[]>(
        `SELECT u.id,
                u.name,
                u.staff_id,
                u.email,
                NULL::text AS role,
                u.branch_id,
                ${createdAt}
         FROM ${userTable} u
         WHERE u.id = $1`,
        id,
      );
    }
    return row ?? null;
  }

  async create(
    schemaName: string,
    dto: {
      name?: string;
      staffId?: string;
      email?: string;
      password?: string;
      role?: string;
      pin?: string;
      branchId?: string;
    },
    actorBranchId: string,
    allowedBranchIds: string[],
    actorRole?: string | null,
  ) {
    const meta = await this.resolveTenantUserTables(schemaName);
    if (!meta.hasBranchId) {
      throw new BadRequestException(
        'users.branch_id is required for branch-isolated staff management',
      );
    }
    const userTable = meta.userTable.startsWith('"')
      ? `"${schemaName}".${meta.userTable}`
      : `"${schemaName}".${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `"${schemaName}".${meta.roleTable}`
        : `"${schemaName}".${meta.roleTable}`);

    const hashed =
      dto.password && dto.password.length > 0
        ? await import('bcrypt').then((m) => m.hash(dto.password!, 10))
        : null;

    const roleName = dto.role?.trim() ? dto.role.trim() : null;
    const roleLower = normalizeRole(roleName);
    const staffId = dto.staffId?.trim() || null;
    const actorRoleLower = normalizeRole(actorRole);
    const actorHasGlobalAccess = hasGlobalBranchAccess(actorRoleLower);
    const pinPlain = dto.pin?.trim() ?? '';
    let pinHash: string | null = null;
    if (meta.hasPinHash && pinPlain.length > 0) {
      if (!this.canUsePosPin(roleLower)) {
        throw new BadRequestException(
          'PIN can only be set for cashier, manager, admin, or pharmacist roles',
        );
      }
      await this.assertPosPinUnique(schemaName, pinPlain);
      pinHash = await import('bcrypt').then((m) => m.hash(pinPlain, 10));
    } else if (
      meta.hasPinHash &&
      pinPlain.length === 0 &&
      dto.password &&
      /^\d{4,12}$/.test(dto.password.trim())
    ) {
      /** POS keypad login uses `pin_hash`; sync numeric web passwords when `pin` is omitted. */
      if (this.canUsePosPin(roleLower)) {
        const syncPin = dto.password.trim();
        await this.assertPosPinUnique(schemaName, syncPin);
        pinHash = await import('bcrypt').then((m) => m.hash(syncPin, 10));
      }
    }

    let inserted: any = null;

    const targetBranchId =
      dto.branchId?.trim() ||
      (requiresAssignedBranch(roleLower) ? actorBranchId : null);
    if (targetBranchId && !allowedBranchIds.includes(targetBranchId)) {
      throw new BadRequestException(
        'Invalid or unauthorized branch assignment',
      );
    }
    if (!targetBranchId && requiresAssignedBranch(roleLower)) {
      throw new BadRequestException(
        `Role "${roleName ?? 'staff'}" requires a branch assignment`,
      );
    }
    if (roleLower === 'cashier' && !staffId) {
      throw new BadRequestException(
        'Staff ID is required for cashier accounts',
      );
    }
    if (
      dto.branchId &&
      !actorHasGlobalAccess &&
      dto.branchId !== actorBranchId
    ) {
      throw new BadRequestException(
        'You cannot assign staff to a different branch',
      );
    }

    if (meta.hasRoleId && roleTable) {
      let roleId: string | null = null;
      if (roleName) {
        const [r] = await this.prisma.queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM ${roleTable} WHERE lower(name) = lower($1::text)`,
          roleName,
        );
        if (!r?.id) {
          throw new BadRequestException(
            `Role "${roleName}" not found in tenant "${schemaName}". Create the role first, then assign it.`,
          );
        }
        roleId = r.id;
      }

      if (meta.hasPinHash) {
        [inserted] = await this.prisma.queryRawUnsafe<any[]>(
          `INSERT INTO ${userTable} (name, staff_id, email, password, role_id, pin_hash, branch_id)
           VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::uuid)
           RETURNING id`,
          dto.name ?? null,
          staffId,
          dto.email ?? null,
          hashed,
          roleId,
          pinHash,
          targetBranchId,
        );
      } else {
        [inserted] = await this.prisma.queryRawUnsafe<any[]>(
          `INSERT INTO ${userTable} (name, staff_id, email, password, role_id, branch_id)
           VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid)
           RETURNING id`,
          dto.name ?? null,
          staffId,
          dto.email ?? null,
          hashed,
          roleId,
          targetBranchId,
        );
      }
    } else if (meta.hasRoleText) {
      if (meta.hasPinHash) {
        [inserted] = await this.prisma.queryRawUnsafe<any[]>(
          `INSERT INTO ${userTable} (name, staff_id, email, password, role, pin_hash, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)
           RETURNING id`,
          dto.name ?? null,
          staffId,
          dto.email ?? null,
          hashed,
          roleName,
          pinHash,
          targetBranchId,
        );
      } else {
        [inserted] = await this.prisma.queryRawUnsafe<any[]>(
          `INSERT INTO ${userTable} (name, staff_id, email, password, role, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid)
           RETURNING id`,
          dto.name ?? null,
          staffId,
          dto.email ?? null,
          hashed,
          roleName,
          targetBranchId,
        );
      }
    } else {
      if (meta.hasPinHash) {
        [inserted] = await this.prisma.queryRawUnsafe<any[]>(
          `INSERT INTO ${userTable} (name, staff_id, email, password, pin_hash, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid)
           RETURNING id`,
          dto.name ?? null,
          staffId,
          dto.email ?? null,
          hashed,
          pinHash,
          targetBranchId,
        );
      } else {
        [inserted] = await this.prisma.queryRawUnsafe<any[]>(
          `INSERT INTO ${userTable} (name, staff_id, email, password, branch_id)
           VALUES ($1, $2, $3, $4, $5::uuid)
           RETURNING id`,
          dto.name ?? null,
          staffId,
          dto.email ?? null,
          hashed,
          targetBranchId,
        );
      }
    }

    if (!inserted) {
      return null;
    }

    return this.findOne(schemaName, inserted.id);
  }

  async update(
    schemaName: string,
    id: string,
    dto: {
      name?: string;
      staffId?: string;
      email?: string;
      password?: string;
      role?: string;
      pin?: string;
      branchId?: string;
    },
    actorBranchId: string,
    allowedBranchIds: string[],
    actorRole?: string | null,
  ) {
    const meta = await this.resolveTenantUserTables(schemaName);
    if (!meta.hasBranchId) {
      throw new BadRequestException(
        'users.branch_id is required for branch-isolated staff management',
      );
    }
    const userTable = meta.userTable.startsWith('"')
      ? `"${schemaName}".${meta.userTable}`
      : `"${schemaName}".${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `"${schemaName}".${meta.roleTable}`
        : `"${schemaName}".${meta.roleTable}`);

    const roleName = dto.role?.trim() ? dto.role.trim() : null;
    const staffId = dto.staffId?.trim() || null;
    const actorRoleLower = normalizeRole(actorRole);
    const actorHasGlobalAccess = hasGlobalBranchAccess(actorRoleLower);
    const password =
      dto.password && dto.password.length > 0
        ? await import('bcrypt').then((m) => m.hash(dto.password!, 10))
        : null;

    if (dto.branchId && !allowedBranchIds.includes(dto.branchId)) {
      throw new BadRequestException(
        'Invalid or unauthorized branch assignment',
      );
    }
    if (
      dto.branchId &&
      !actorHasGlobalAccess &&
      dto.branchId !== actorBranchId
    ) {
      throw new BadRequestException(
        'You cannot assign staff to a different branch',
      );
    }

    const [currentUser] = await this.prisma.queryRawUnsafe<
      { role_name: string | null; branch_id: string | null }[]
    >(
      `SELECT
         ${
           meta.hasRoleId && roleTable
             ? `r.name`
             : meta.hasRoleText
               ? `u.role`
               : `NULL::text`
         } AS role_name,
         u.branch_id
       FROM ${userTable} u
       ${
         meta.hasRoleId && roleTable
           ? `LEFT JOIN ${roleTable} r ON u.role_id = r.id`
           : ``
       }
       WHERE u.id = $1`,
      id,
    );
    if (!currentUser) {
      return null;
    }
    const nextRoleName =
      dto.role !== undefined ? roleName : currentUser.role_name;
    const nextRoleLower = normalizeRole(nextRoleName);
    const nextBranchId =
      dto.branchId !== undefined ? dto.branchId : currentUser.branch_id;
    if (requiresAssignedBranch(nextRoleLower) && !nextBranchId) {
      throw new BadRequestException(
        `Role "${nextRoleName ?? 'staff'}" requires a branch assignment`,
      );
    }
    if (
      nextRoleLower === 'cashier' &&
      dto.staffId !== undefined &&
      !staffId
    ) {
      throw new BadRequestException(
        'Staff ID is required for cashier accounts',
      );
    }

    let updated: any = null;
    if (meta.hasRoleId && roleTable) {
      let roleId: string | null | undefined = undefined;
      if (dto.role !== undefined) {
        // Role is being explicitly set. Empty value clears the role_id.
        if (!roleName) {
          roleId = null;
        } else {
          const [r] = await this.prisma.queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM ${roleTable} WHERE lower(name) = lower($1::text)`,
            roleName,
          );
          if (!r?.id) {
            throw new BadRequestException(
              `Role "${roleName}" not found in tenant "${schemaName}". Create the role first, then assign it.`,
            );
          }
          roleId = r.id;
        }
      }

      [updated] = await this.prisma.queryRawUnsafe<any[]>(
        `UPDATE ${userTable}
         SET name = COALESCE($2, name),
             staff_id = COALESCE($3, staff_id),
             email = COALESCE($4, email),
             password = COALESCE($5, password),
             role_id = CASE
               WHEN $6::text = '__KEEP__' THEN role_id
               WHEN $6::text = '__CLEAR__' THEN NULL
               ELSE $7::uuid
             END,
             branch_id = CASE
               WHEN $8::text = '__KEEP__' THEN branch_id
               ELSE $9::uuid
             END
         WHERE id = $1
         RETURNING id`,
        id,
        dto.name ?? null,
        staffId,
        dto.email ?? null,
        password,
        dto.role === undefined
          ? '__KEEP__'
          : roleId === null
            ? '__CLEAR__'
            : '__SET__',
        roleId ?? null,
        dto.branchId === undefined ? '__KEEP__' : '__SET__',
        dto.branchId ?? null,
      );
    } else if (meta.hasRoleText) {
      [updated] = await this.prisma.queryRawUnsafe<any[]>(
        `UPDATE ${userTable}
         SET name = COALESCE($2, name),
             staff_id = COALESCE($3, staff_id),
             email = COALESCE($4, email),
             password = COALESCE($5, password),
             role = COALESCE($6, role),
             branch_id = CASE
               WHEN $7::text = '__KEEP__' THEN branch_id
               ELSE $8::uuid
             END
         WHERE id = $1
         RETURNING id`,
        id,
        dto.name ?? null,
        staffId,
        dto.email ?? null,
        password,
        roleName,
        dto.branchId === undefined ? '__KEEP__' : '__SET__',
        dto.branchId ?? null,
      );
    } else {
      [updated] = await this.prisma.queryRawUnsafe<any[]>(
        `UPDATE ${userTable}
         SET name = COALESCE($2, name),
             staff_id = COALESCE($3, staff_id),
             email = COALESCE($4, email),
             password = COALESCE($5, password),
             branch_id = CASE
               WHEN $6::text = '__KEEP__' THEN branch_id
               ELSE $7::uuid
             END
         WHERE id = $1
         RETURNING id`,
        id,
        dto.name ?? null,
        staffId,
        dto.email ?? null,
        password,
        dto.branchId === undefined ? '__KEEP__' : '__SET__',
        dto.branchId ?? null,
      );
    }
    if (!updated) {
      return null;
    }

    if (meta.hasPinHash && dto.pin !== undefined) {
      const pinPlain = dto.pin.trim();
      let roleLower = '';
      if (meta.hasRoleId && roleTable) {
        const [row] = await this.prisma.queryRawUnsafe<
          { name: string | null }[]
        >(
          `SELECT r.name AS name FROM ${userTable} u
           LEFT JOIN ${roleTable} r ON u.role_id = r.id WHERE u.id = $1`,
          id,
        );
        roleLower = (row?.name ?? '').toLowerCase();
      } else if (meta.hasRoleText) {
        const [row] = await this.prisma.queryRawUnsafe<
          { role: string | null }[]
        >(`SELECT role FROM ${userTable} WHERE id = $1`, id);
        roleLower = (row?.role ?? '').toLowerCase();
      }

      if (pinPlain.length > 0) {
        if (!this.canUsePosPin(roleLower)) {
          throw new BadRequestException(
            'PIN can only be set for cashier, manager, admin, or pharmacist roles',
          );
        }
        await this.assertPosPinUnique(schemaName, pinPlain, id);
        const ph = await import('bcrypt').then((m) => m.hash(pinPlain, 10));
        await this.prisma.queryRawUnsafe(
          `UPDATE ${userTable} SET pin_hash = $2 WHERE id = $1`,
          id,
          ph,
        );
      } else {
        await this.prisma.queryRawUnsafe(
          `UPDATE ${userTable} SET pin_hash = NULL WHERE id = $1`,
          id,
        );
      }
    }

    if (
      meta.hasPinHash &&
      dto.pin === undefined &&
      dto.password !== undefined &&
      dto.password.length > 0 &&
      /^\d{4,12}$/.test(dto.password.trim())
    ) {
      const syncPin = dto.password.trim();
      if (this.canUsePosPin(nextRoleLower)) {
        await this.assertPosPinUnique(schemaName, syncPin, id);
        const ph = await import('bcrypt').then((m) => m.hash(syncPin, 10));
        await this.prisma.queryRawUnsafe(
          `UPDATE ${userTable} SET pin_hash = $2 WHERE id = $1`,
          id,
          ph,
        );
      }
    }

    return this.findOne(schemaName, updated.id);
  }

  async remove(schemaName: string, id: string) {
    const meta = await this.resolveTenantUserTables(schemaName);
    const userTable = meta.userTable.startsWith('"')
      ? `"${schemaName}".${meta.userTable}`
      : `"${schemaName}".${meta.userTable}`;
    await this.prisma.queryRawUnsafe(
      `DELETE FROM ${userTable} WHERE id = $1`,
      id,
    );
    return { deleted: true };
  }
}
