import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  hasGlobalBranchAccess,
  normalizeRole,
  requiresAssignedBranch,
} from '../common/security/branch-access.policy';

export interface StaffTenantUserRow {
  id: string;
  name: string | null;
  staff_id: string | null;
  email: string | null;
  role: string | null;
  branch_id: string | null;
  created_at: Date | null;
}

export interface StaffIdOnlyRow {
  id: string;
}

export interface StaffTenantUserTableMeta {
  userTable: string;
  roleTable: string | null;
  hasRoleId: boolean;
  hasRoleText: boolean;
  hasPinHash: boolean;
  hasBranchId: boolean;
  createdAtColumn: string | null;
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    _config: ConfigService,
  ) {}

  private resolvePhysicalSchema(_schemaName: string): string {
    return 'public';
  }

  /** Run raw SQL against an explicit tenant (not the request X-Tenant header). */
  private queryRawUnsafeForTenant<T>(
    schemaName: string,
    query: string,
    ...values: unknown[]
  ): Promise<T> {
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<T>(query, ...values),
    );
  }

  /** Columns that link ERP/POS rows to a staff user (users table excluded). */
  private static readonly STAFF_ACTIVITY_USER_COLUMNS = [
    'staff_user_id',
    'actor_user_id',
    'user_id',
    'credit_override_manager_id',
    'created_by',
    'reversed_by',
  ] as const;

  /**
   * Staff with POS, sales, audit, or other tenant records cannot be moved — only
   * unused accounts (no linked activity outside `users`) may transfer.
   */
  private async assertStaffHasNoSourceTenantActivity(
    sourceSchema: string,
    userId: string,
  ): Promise<void> {
    const physicalSchema = this.resolvePhysicalSchema(sourceSchema);
    const columns = await this.queryRawUnsafeForTenant<
      { table_name: string; column_name: string }[]
    >(
      sourceSchema,
      `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND column_name = ANY($2::text[])
        AND table_name NOT IN ('users', 'User')
      ORDER BY table_name, column_name
      `,
      physicalSchema,
      [...StaffService.STAFF_ACTIVITY_USER_COLUMNS],
    );

    if (!columns.length) {
      return;
    }

    const existsChecks = columns
      .map(
        (col) =>
          `EXISTS (SELECT 1 FROM "${col.table_name.replace(/"/g, '""')}" WHERE "${col.column_name.replace(/"/g, '""')}" = $1::uuid)`,
      )
      .join(' OR ');

    const [row] = await this.queryRawUnsafeForTenant<{ blocked: boolean }[]>(
      sourceSchema,
      `SELECT (${existsChecks}) AS blocked`,
      userId,
    );

    if (row?.blocked) {
      throw new BadRequestException(
        `Cannot move this staff member to another pharmacy because they have activity in "${sourceSchema}". Create a new account in the target pharmacy instead.`,
      );
    }
  }

  private async ensureStaffTenantSchema(schemaName: string): Promise<void> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
  }

  private async resolveTenantUserTables(
    schemaName: string,
  ): Promise<StaffTenantUserTableMeta> {
    const physicalSchema = this.resolvePhysicalSchema(schemaName);
    const [schemaRow] = await this.prisma.withTenantSchema(
      schemaName,
      (tx) =>
        tx.$queryRawUnsafe<{ ok: boolean }[]>(
          `
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = $1
          ) as ok
          `,
          physicalSchema,
        ),
    );
    if (!schemaRow?.ok) {
      throw new ServiceUnavailableException(
        `Tenant schema "${schemaName}" is not provisioned. Create the tenant or run schema provisioning first.`,
      );
    }

    const [userRow] = await this.prisma.withTenantSchema(
      schemaName,
      (tx) =>
        tx.$queryRawUnsafe<
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
          physicalSchema,
        ),
    );

    const userTable = userRow?.user_table ?? null;
    if (!userTable) {
      throw new ServiceUnavailableException(
        `Tenant "${schemaName}" has no staff users table (expected "users" or "User").`,
      );
    }

    const getHasColumn = async (tableName: string, columnName: string) => {
      const clean = tableName.replace(/"/g, '');
      const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<{ ok: boolean }[]>(
          `
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = $2
              AND column_name = $3
          ) as ok
          `,
          physicalSchema,
          clean,
          columnName,
        ),
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
    meta: StaffTenantUserTableMeta,
    plainPin: string,
    excludeUserId?: string,
  ) {
    const userTable = meta.userTable.startsWith('"')
      ? `${meta.userTable}`
      : `${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `${meta.roleTable}`
        : `${meta.roleTable}`);

    const posRoles = `('cashier', 'manager', 'admin', 'pharmacist')`;
    let sql: string;
    if (meta.hasRoleId && roleTable) {
      sql = `SELECT u.id, u.pin_hash
       FROM ${userTable} u
       INNER JOIN ${roleTable} r ON u.role_id = r.id
       WHERE lower(r.name) IN ${posRoles}
         AND u.pin_hash IS NOT NULL
         AND ($1::uuid IS NULL OR u.id <> $1::uuid)`;
    } else if (meta.hasRoleText) {
      sql = `SELECT u.id, u.pin_hash
       FROM ${userTable} u
       WHERE lower(COALESCE(u.role, '')) IN ${posRoles}
         AND u.pin_hash IS NOT NULL
         AND ($1::uuid IS NULL OR u.id <> $1::uuid)`;
    } else {
      sql = `SELECT u.id, u.pin_hash
       FROM ${userTable} u
       WHERE u.pin_hash IS NOT NULL
         AND ($1::uuid IS NULL OR u.id <> $1::uuid)`;
    }

    const rows = await this.queryRawUnsafeForTenant<
      { id: string; pin_hash: string }[]
    >(schemaName, sql, excludeUserId ?? null);
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
    await this.ensureStaffTenantSchema(schemaName);
    const meta = await this.resolveTenantUserTables(schemaName);
    const userTable = meta.userTable.startsWith('"')
      ? `${meta.userTable}`
      : `${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `${meta.roleTable}`
        : `${meta.roleTable}`);

    const createdAt = meta.createdAtColumn
      ? `u.${meta.createdAtColumn} AS created_at`
      : `NULL::timestamp AS created_at`;

    // Prefer role join if role_id + roles table exists; otherwise use text role column if present.
    if (meta.hasRoleId && roleTable) {
      return this.queryRawUnsafeForTenant(
        schemaName,
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
      return this.queryRawUnsafeForTenant(
        schemaName,
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

    return this.queryRawUnsafeForTenant(
      schemaName,
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
    await this.ensureStaffTenantSchema(schemaName);
    const meta = await this.resolveTenantUserTables(schemaName);
    const userTable = meta.userTable.startsWith('"')
      ? `${meta.userTable}`
      : `${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `${meta.roleTable}`
        : `${meta.roleTable}`);

    const createdAt = meta.createdAtColumn
      ? `u.${meta.createdAtColumn} AS created_at`
      : `NULL::timestamp AS created_at`;

    let row: StaffTenantUserRow | undefined;
    if (meta.hasRoleId && roleTable) {
      [row] = await this.queryRawUnsafeForTenant<StaffTenantUserRow[]>(
        schemaName,
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
      [row] = await this.queryRawUnsafeForTenant<StaffTenantUserRow[]>(
        schemaName,
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
      [row] = await this.queryRawUnsafeForTenant<StaffTenantUserRow[]>(
        schemaName,
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
    await this.ensureStaffTenantSchema(schemaName);
    const meta = await this.resolveTenantUserTables(schemaName);
    if (!meta.hasBranchId) {
      throw new BadRequestException(
        'users.branch_id is required for branch-isolated staff management',
      );
    }
    const userTable = meta.userTable.startsWith('"')
      ? `${meta.userTable}`
      : `${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `${meta.roleTable}`
        : `${meta.roleTable}`);

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
      await this.assertPosPinUnique(schemaName, meta, pinPlain);
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
        await this.assertPosPinUnique(schemaName, meta, syncPin);
        pinHash = await import('bcrypt').then((m) => m.hash(syncPin, 10));
      }
    }

    let inserted: StaffIdOnlyRow | null = null;

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
        const [r] = await this.queryRawUnsafeForTenant<{ id: string }[]>(
          schemaName,
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
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          schemaName,
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
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          schemaName,
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
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          schemaName,
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
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          schemaName,
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
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          schemaName,
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
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          schemaName,
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
    await this.ensureStaffTenantSchema(schemaName);
    const meta = await this.resolveTenantUserTables(schemaName);
    if (!meta.hasBranchId) {
      throw new BadRequestException(
        'users.branch_id is required for branch-isolated staff management',
      );
    }
    const userTable = meta.userTable.startsWith('"')
      ? `${meta.userTable}`
      : `${meta.userTable}`;
    const roleTable =
      meta.roleTable &&
      (meta.roleTable.startsWith('"')
        ? `${meta.roleTable}`
        : `${meta.roleTable}`);

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

    const [currentUser] = await this.queryRawUnsafeForTenant<
      { role_name: string | null; branch_id: string | null }[]
    >(
      schemaName,
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
    if (dto.email !== undefined) {
      const nextEmail = dto.email.trim() || null;
      if (nextEmail) {
        const [existingEmail] = await this.queryRawUnsafeForTenant<
          { id: string }[]
        >(
          schemaName,
          `SELECT id FROM ${userTable} WHERE lower(email) = lower($1::text) AND id <> $2::uuid LIMIT 1`,
          nextEmail,
          id,
        );
        if (existingEmail) {
          throw new BadRequestException(
            `Email "${nextEmail}" is already used in this pharmacy`,
          );
        }
      }
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
    if (nextRoleLower === 'cashier' && dto.staffId !== undefined && !staffId) {
      throw new BadRequestException(
        'Staff ID is required for cashier accounts',
      );
    }

    let updated: StaffIdOnlyRow | null = null;
    if (meta.hasRoleId && roleTable) {
      let roleId: string | null | undefined = undefined;
      if (dto.role !== undefined) {
        // Role is being explicitly set. Empty value clears the role_id.
        if (!roleName) {
          roleId = null;
        } else {
          const [r] = await this.queryRawUnsafeForTenant<{ id: string }[]>(
            schemaName,
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

      [updated] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
        schemaName,
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
      [updated] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
        schemaName,
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
      [updated] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
        schemaName,
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
        const [row] = await this.queryRawUnsafeForTenant<
          { name: string | null }[]
        >(
          schemaName,
          `SELECT r.name AS name FROM ${userTable} u
           LEFT JOIN ${roleTable} r ON u.role_id = r.id WHERE u.id = $1`,
          id,
        );
        roleLower = (row?.name ?? '').toLowerCase();
      } else if (meta.hasRoleText) {
        const [row] = await this.queryRawUnsafeForTenant<
          { role: string | null }[]
        >(schemaName, `SELECT role FROM ${userTable} WHERE id = $1`, id);
        roleLower = (row?.role ?? '').toLowerCase();
      }

      if (pinPlain.length > 0) {
        if (!this.canUsePosPin(roleLower)) {
          throw new BadRequestException(
            'PIN can only be set for cashier, manager, admin, or pharmacist roles',
          );
        }
        await this.assertPosPinUnique(schemaName, meta, pinPlain, id);
        const ph = await import('bcrypt').then((m) => m.hash(pinPlain, 10));
        await this.queryRawUnsafeForTenant(
          schemaName,
          `UPDATE ${userTable} SET pin_hash = $2 WHERE id = $1`,
          id,
          ph,
        );
      } else {
        await this.queryRawUnsafeForTenant(
          schemaName,
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
        await this.assertPosPinUnique(schemaName, meta, syncPin, id);
        const ph = await import('bcrypt').then((m) => m.hash(syncPin, 10));
        await this.queryRawUnsafeForTenant(
          schemaName,
          `UPDATE ${userTable} SET pin_hash = $2 WHERE id = $1`,
          id,
          ph,
        );
      }
    }

    return this.findOne(schemaName, updated.id);
  }

  async transfer(
    sourceSchema: string,
    targetSchema: string,
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
    if (sourceSchema.toLowerCase() === targetSchema.toLowerCase()) {
      return this.update(
        sourceSchema,
        id,
        dto,
        actorBranchId,
        allowedBranchIds,
        actorRole,
      );
    }

    await this.ensureStaffTenantSchema(sourceSchema);
    await this.ensureStaffTenantSchema(targetSchema);

    const sourceMeta = await this.resolveTenantUserTables(sourceSchema);
    const targetMeta = await this.resolveTenantUserTables(targetSchema);
    if (!targetMeta.hasBranchId) {
      throw new BadRequestException(
        'Target pharmacy schema is missing branch_id on users',
      );
    }

    const sourceUserTable = sourceMeta.userTable.startsWith('"')
      ? `${sourceMeta.userTable}`
      : `${sourceMeta.userTable}`;
    const sourceRoleTable =
      sourceMeta.roleTable &&
      (sourceMeta.roleTable.startsWith('"')
        ? `${sourceMeta.roleTable}`
        : `${sourceMeta.roleTable}`);

    const [sourceUser] = await this.queryRawUnsafeForTenant<
      {
        name: string | null;
        staff_id: string | null;
        email: string | null;
        password: string | null;
        pin_hash: string | null;
        role_name: string | null;
        branch_id: string | null;
      }[]
    >(
      sourceSchema,
      `SELECT u.name,
              u.staff_id,
              u.email,
              u.password,
              ${sourceMeta.hasPinHash ? 'u.pin_hash' : 'NULL::text AS pin_hash'},
              ${
                sourceMeta.hasRoleId && sourceRoleTable
                  ? 'r.name'
                  : sourceMeta.hasRoleText
                    ? 'u.role'
                    : 'NULL::text'
              } AS role_name,
              u.branch_id
       FROM ${sourceUserTable} u
       ${
         sourceMeta.hasRoleId && sourceRoleTable
           ? `LEFT JOIN ${sourceRoleTable} r ON u.role_id = r.id`
           : ``
       }
       WHERE u.id = $1`,
      id,
    );
    if (!sourceUser) {
      throw new BadRequestException('Staff member not found in source pharmacy');
    }

    await this.assertStaffHasNoSourceTenantActivity(sourceSchema, id);

    const roleName =
      dto.role !== undefined
        ? dto.role.trim() || null
        : sourceUser.role_name?.trim() || null;
    const staffId =
      dto.staffId !== undefined
        ? dto.staffId.trim() || null
        : sourceUser.staff_id?.trim() || null;
    const name =
      dto.name !== undefined ? dto.name.trim() || null : sourceUser.name;
    const email =
      dto.email !== undefined
        ? dto.email.trim() || null
        : sourceUser.email?.trim() || null;

    if (email) {
      const targetUserTable = targetMeta.userTable.startsWith('"')
        ? `${targetMeta.userTable}`
        : `${targetMeta.userTable}`;
      const [existing] = await this.queryRawUnsafeForTenant<{ id: string }[]>(
        targetSchema,
        `SELECT id FROM ${targetUserTable} WHERE lower(email) = lower($1::text) LIMIT 1`,
        email,
      );
      if (existing) {
        throw new BadRequestException(
          `Email "${email}" is already used in pharmacy "${targetSchema}"`,
        );
      }
    }

    const password =
      dto.password && dto.password.length > 0
        ? await import('bcrypt').then((m) => m.hash(dto.password!, 10))
        : sourceUser.password;

    const roleLower = normalizeRole(roleName);
    if (roleLower === 'cashier' && !staffId) {
      throw new BadRequestException(
        'Staff ID is required for cashier accounts',
      );
    }

    const [defaultBranch] = await this.queryRawUnsafeForTenant<{ id: string }[]>(
      targetSchema,
      `SELECT id FROM "branches" ORDER BY name LIMIT 1`,
    );
    const targetBranchId =
      dto.branchId?.trim() ||
      (requiresAssignedBranch(roleLower) ? defaultBranch?.id ?? null : null);
    if (requiresAssignedBranch(roleLower) && !targetBranchId) {
      throw new BadRequestException(
        `Role "${roleName ?? 'staff'}" requires a branch in the target pharmacy`,
      );
    }

    const targetUserTable = targetMeta.userTable.startsWith('"')
      ? `${targetMeta.userTable}`
      : `${targetMeta.userTable}`;
    const targetRoleTable =
      targetMeta.roleTable &&
      (targetMeta.roleTable.startsWith('"')
        ? `${targetMeta.roleTable}`
        : `${targetMeta.roleTable}`);

    let pinHash = sourceMeta.hasPinHash ? sourceUser.pin_hash : null;
    if (targetMeta.hasPinHash && dto.pin !== undefined) {
      const pinPlain = dto.pin.trim();
      if (pinPlain.length > 0) {
        if (!this.canUsePosPin(roleLower)) {
          throw new BadRequestException(
            'PIN can only be set for cashier, manager, admin, or pharmacist roles',
          );
        }
        await this.assertPosPinUnique(targetSchema, targetMeta, pinPlain);
        pinHash = await import('bcrypt').then((m) => m.hash(pinPlain, 10));
      } else {
        pinHash = null;
      }
    } else if (
      targetMeta.hasPinHash &&
      dto.password &&
      dto.password.length > 0 &&
      /^\d{4,12}$/.test(dto.password.trim()) &&
      this.canUsePosPin(roleLower)
    ) {
      const syncPin = dto.password.trim();
      await this.assertPosPinUnique(targetSchema, targetMeta, syncPin);
      pinHash = await import('bcrypt').then((m) => m.hash(syncPin, 10));
    }

    let inserted: StaffIdOnlyRow | null = null;

    if (targetMeta.hasRoleId && targetRoleTable) {
      let roleId: string | null = null;
      if (roleName) {
        const [r] = await this.queryRawUnsafeForTenant<{ id: string }[]>(
          targetSchema,
          `SELECT id FROM ${targetRoleTable} WHERE lower(name) = lower($1::text)`,
          roleName,
        );
        if (!r?.id) {
          throw new BadRequestException(
            `Role "${roleName}" not found in pharmacy "${targetSchema}". Create the role first, then move the user.`,
          );
        }
        roleId = r.id;
      }

      if (targetMeta.hasPinHash) {
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          targetSchema,
          `INSERT INTO ${targetUserTable} (name, staff_id, email, password, role_id, pin_hash, branch_id)
           VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::uuid)
           RETURNING id`,
          name,
          staffId,
          email,
          password,
          roleId,
          pinHash,
          targetBranchId,
        );
      } else {
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          targetSchema,
          `INSERT INTO ${targetUserTable} (name, staff_id, email, password, role_id, branch_id)
           VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid)
           RETURNING id`,
          name,
          staffId,
          email,
          password,
          roleId,
          targetBranchId,
        );
      }
    } else if (targetMeta.hasRoleText) {
      if (targetMeta.hasPinHash) {
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          targetSchema,
          `INSERT INTO ${targetUserTable} (name, staff_id, email, password, role, pin_hash, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)
           RETURNING id`,
          name,
          staffId,
          email,
          password,
          roleName,
          pinHash,
          targetBranchId,
        );
      } else {
        [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
          targetSchema,
          `INSERT INTO ${targetUserTable} (name, staff_id, email, password, role, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid)
           RETURNING id`,
          name,
          staffId,
          email,
          password,
          roleName,
          targetBranchId,
        );
      }
    } else {
      [inserted] = await this.queryRawUnsafeForTenant<StaffIdOnlyRow[]>(
        targetSchema,
        `INSERT INTO ${targetUserTable} (name, staff_id, email, password, branch_id)
         VALUES ($1, $2, $3, $4, $5::uuid)
         RETURNING id`,
        name,
        staffId,
        email,
        password,
        targetBranchId,
      );
    }

    if (!inserted) {
      throw new BadRequestException('Failed to create staff in target pharmacy');
    }

    await this.queryRawUnsafeForTenant(
      sourceSchema,
      `DELETE FROM ${sourceUserTable} WHERE id = $1`,
      id,
    );

    return this.findOne(targetSchema, inserted.id);
  }

  async remove(schemaName: string, id: string) {
    await this.ensureStaffTenantSchema(schemaName);
    const meta = await this.resolveTenantUserTables(schemaName);
    const userTable = meta.userTable.startsWith('"')
      ? `${meta.userTable}`
      : `${meta.userTable}`;
    await this.queryRawUnsafeForTenant(
      schemaName,
      `DELETE FROM ${userTable} WHERE id = $1`,
      id,
    );
    return { deleted: true };
  }
}
