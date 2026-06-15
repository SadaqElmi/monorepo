import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { listActiveDedicatedTenants } from '../tenant/tenant-control.repository';
import { TenantService } from '../tenant/tenant.service';
import { PosAuditService } from '../auth/pos-audit.service';
import { PosControlAuditService } from '../auth/pos-control-audit.service';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import { UpdatePosTerminalDto } from './dto/update-pos-terminal.dto';
import {
  isPosTerminalStatus,
  type PosTerminalBindingStatus,
} from './pos-terminal-status';

const SETUP_PASSWORD_ROUNDS = 12;

export type PosTerminalListItem = {
  id: string;
  displayName: string | null;
  terminalUsername: string | null;
  deviceCode: string;
  branchId: string | null;
  branchName: string | null;
  status: string;
  bindingStatus: PosTerminalBindingStatus;
  boundAt: string | null;
  lastSeenAt: string | null;
  lastSetupAttemptAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  deviceFingerprint: string | null;
};

export type ListPosTerminalsOptions = {
  page?: number;
  limit?: number;
  q?: string;
  branchId?: string;
  status?: string;
  bindingStatus?: string;
};

export type PaginatedPosTerminals = {
  items: PosTerminalListItem[];
  total: number;
  page: number;
  limit: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type PosDeviceRow = {
  id: string;
  tenant_id: string;
  device_code: string;
  terminal_username: string | null;
  display_name: string | null;
  status: string;
  binding_status: string;
  branch_id: string | null;
  bound_at: Date | null;
  last_seen_at: Date | null;
  last_setup_attempt_at: Date | null;
  revoked_at: Date | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  device_fingerprint: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class PosTerminalsService implements OnModuleInit {
  private readonly logger = new Logger(PosTerminalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly posAudit: PosAuditService,
    private readonly posControlAudit: PosControlAuditService,
  ) {}

  private recordTerminalMutation(
    tenantId: string,
    schemaName: string,
    deviceId: string,
    action: string,
    actorUserId: string | undefined,
    payload?: Record<string, unknown>,
    branchId?: string | null,
  ): void {
    void this.posAudit.record({
      schemaName,
      deviceId,
      branchId: branchId ?? null,
      actorUserId: actorUserId ?? null,
      action,
      payload: payload ?? null,
    });
    void this.posControlAudit.record({
      tenantId,
      deviceId,
      action,
      actorUserId: actorUserId ?? null,
      payload: payload ?? null,
    });
  }

  async onModuleInit(): Promise<void> {
    void this.bootstrapPosTerminalPermissions().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`POS terminal permission bootstrap skipped: ${message}`);
    });
  }

  /** Grant POS terminal permissions to admin/manager roles on existing tenant DBs. */
  private async bootstrapPosTerminalPermissions(): Promise<void> {
    const tenants = await listActiveDedicatedTenants(this.prisma);
    for (const tenant of tenants) {
      await this.prisma.withTenantSchema(tenant.schemaName, async (tx) => {
        await tx.$executeRawUnsafe(`
          INSERT INTO permissions (name)
          VALUES ('view_pos_terminals'), ('manage_pos_terminals')
          ON CONFLICT (name) DO NOTHING
        `);
        await tx.$executeRawUnsafe(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id
          FROM roles r
          INNER JOIN permissions p
            ON p.name IN ('view_pos_terminals', 'manage_pos_terminals')
          WHERE lower(r.name) IN ('admin', 'manager')
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `);
      });
    }
    if (tenants.length) {
      this.logger.log(
        `POS terminal permissions bootstrapped for ${tenants.length} tenant(s)`,
      );
    }
  }

  private normalizeTerminalUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  private maskFingerprint(fingerprint: string | null): string | null {
    if (!fingerprint?.trim()) return null;
    const trimmed = fingerprint.trim();
    if (trimmed.length <= 8) return trimmed;
    return `…${trimmed.slice(-8)}`;
  }

  private mapRow(
    row: PosDeviceRow,
    branchNames: Map<string, string>,
    userNames: Map<string, string>,
  ): PosTerminalListItem {
    return {
      id: row.id,
      displayName: row.display_name,
      terminalUsername: row.terminal_username,
      deviceCode: row.device_code,
      branchId: row.branch_id,
      branchName: row.branch_id
        ? (branchNames.get(row.branch_id) ?? null)
        : null,
      status: row.status,
      bindingStatus: row.binding_status as PosTerminalBindingStatus,
      boundAt: row.bound_at?.toISOString() ?? null,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      lastSetupAttemptAt: row.last_setup_attempt_at?.toISOString() ?? null,
      revokedAt: row.revoked_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_user_id
        ? (userNames.get(row.created_by_user_id) ?? null)
        : null,
      updatedByUserId: row.updated_by_user_id,
      updatedByName: row.updated_by_user_id
        ? (userNames.get(row.updated_by_user_id) ?? null)
        : null,
      deviceFingerprint: this.maskFingerprint(row.device_fingerprint),
    };
  }

  private async loadUserNames(
    schemaName: string,
    userIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ id: string; name: string | null }[]>(
        `SELECT id, name FROM users WHERE id = ANY($1::uuid[])`,
        uniqueIds,
      ),
    );
    return new Map(
      rows.map((r) => [r.id, r.name?.trim() || 'Unknown user']),
    );
  }

  private buildListWhereClause(
    tenantId: string,
    options: ListPosTerminalsOptions,
  ): { whereSql: string; params: unknown[] } {
    const conditions = ['tenant_id = $1::uuid'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (options.branchId) {
      conditions.push(`branch_id = $${idx}::uuid`);
      params.push(options.branchId);
      idx += 1;
    }
    if (options.status) {
      conditions.push(`status = $${idx}`);
      params.push(options.status);
      idx += 1;
    }
    if (options.bindingStatus) {
      conditions.push(`binding_status = $${idx}`);
      params.push(options.bindingStatus);
      idx += 1;
    }
    if (options.q?.trim()) {
      const pattern = `%${options.q.trim().replace(/[%_]/g, '\\$&')}%`;
      conditions.push(
        `(display_name ILIKE $${idx} OR terminal_username ILIKE $${idx} OR device_code ILIKE $${idx})`,
      );
      params.push(pattern);
      idx += 1;
    }

    return { whereSql: conditions.join(' AND '), params };
  }

  private deviceSelectColumns(): string {
    return `id, tenant_id, device_code, terminal_username, display_name,
            status, binding_status, branch_id, bound_at, last_seen_at,
            last_setup_attempt_at, revoked_at, created_by_user_id,
            updated_by_user_id, device_fingerprint, created_at, updated_at`;
  }

  private async loadBranchNames(
    schemaName: string,
    branchIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(branchIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ id: string; name: string | null }[]>(
        `SELECT id, name FROM branches WHERE id = ANY($1::uuid[])`,
        uniqueIds,
      ),
    );
    return new Map(rows.map((r) => [r.id, r.name?.trim() || 'Unnamed branch']));
  }

  private async assertBranchExists(
    schemaName: string,
    branchId: string,
  ): Promise<void> {
    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM branches WHERE id = $1::uuid LIMIT 1`,
        branchId,
      ),
    );
    if (!row) {
      throw new BadRequestException('Branch not found');
    }
  }

  private async assertTerminalUsernameAvailable(
    terminalUsername: string,
    excludeId?: string,
  ): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "public"."pos_devices"
       WHERE lower(terminal_username) = lower($1)
       ${excludeId ? 'AND id <> $2::uuid' : ''}
       LIMIT 1`,
      terminalUsername,
      ...(excludeId ? [excludeId] : []),
    );
    if (rows.length) {
      throw new BadRequestException('Terminal username is already in use');
    }
  }

  async findAll(
    tenantId: string,
    schemaName: string,
    options?: ListPosTerminalsOptions,
  ): Promise<PaginatedPosTerminals> {
    const page = Math.max(1, options?.page ?? DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, options?.limit ?? DEFAULT_LIMIT),
    );
    const offset = (page - 1) * limit;
    const { whereSql, params } = this.buildListWhereClause(tenantId, options ?? {});

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM "public"."pos_devices"
         WHERE ${whereSql}`,
        ...params,
      ),
      this.prisma.$queryRawUnsafe<PosDeviceRow[]>(
        `SELECT ${this.deviceSelectColumns()}
         FROM "public"."pos_devices"
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params,
        limit,
        offset,
      ),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const branchIds = rows
      .map((r) => r.branch_id)
      .filter((id): id is string => Boolean(id));
    const userIds = rows.flatMap((r) =>
      [r.created_by_user_id, r.updated_by_user_id].filter(
        (id): id is string => Boolean(id),
      ),
    );
    const [branchNames, userNames] = await Promise.all([
      this.loadBranchNames(schemaName, branchIds),
      this.loadUserNames(schemaName, userIds),
    ]);
    return {
      items: rows.map((row) => this.mapRow(row, branchNames, userNames)),
      total,
      page,
      limit,
    };
  }

  async findOne(
    tenantId: string,
    schemaName: string,
    id: string,
  ): Promise<PosTerminalListItem> {
    const [row] = await this.prisma.$queryRawUnsafe<PosDeviceRow[]>(
      `SELECT ${this.deviceSelectColumns()}
       FROM "public"."pos_devices"
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      tenantId,
      id,
    );
    if (!row) {
      throw new NotFoundException('POS terminal not found');
    }
    const userIds = [row.created_by_user_id, row.updated_by_user_id].filter(
      (uid): uid is string => Boolean(uid),
    );
    const [branchNames, userNames] = await Promise.all([
      this.loadBranchNames(
        schemaName,
        row.branch_id ? [row.branch_id] : [],
      ),
      this.loadUserNames(schemaName, userIds),
    ]);
    return this.mapRow(row, branchNames, userNames);
  }

  async create(
    tenantId: string,
    schemaName: string,
    dto: CreatePosTerminalDto,
    createdByUserId?: string,
  ): Promise<PosTerminalListItem> {
    const terminalUsername = this.normalizeTerminalUsername(dto.terminalUsername);
    const status = dto.status ?? 'active';
    if (!isPosTerminalStatus(status)) {
      throw new BadRequestException('Invalid terminal status');
    }

    await this.assertBranchExists(schemaName, dto.branchId);
    await this.assertTerminalUsernameAvailable(terminalUsername);

    const setupPasswordHash = await bcrypt.hash(dto.password, SETUP_PASSWORD_ROUNDS);
    const deviceCode = `TERM-${randomUUID()}`;
    const displayName = dto.displayName.trim();

    const inserted = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "public"."pos_devices" (
         tenant_id, device_code, terminal_username, display_name, status,
         binding_status, setup_password_hash, branch_id, created_by_user_id,
         created_at, updated_at
       )
       VALUES ($1::uuid, $2, $3, $4, $5, 'unbound', $6, $7::uuid, $8::uuid,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      tenantId,
      deviceCode,
      terminalUsername,
      displayName,
      status,
      setupPasswordHash,
      dto.branchId,
      createdByUserId ?? null,
    );
    const id = inserted[0]?.id;
    if (!id) {
      throw new BadRequestException('Failed to create POS terminal');
    }

    this.logger.log(
      JSON.stringify({
        kind: 'pos_terminal_created',
        tenantId,
        terminalId: id,
        terminalUsername,
        branchId: dto.branchId,
      }),
    );

    this.recordTerminalMutation(
      tenantId,
      schemaName,
      id,
      'pos_terminal_created',
      createdByUserId,
      { terminalUsername, displayName, status },
      dto.branchId,
    );

    return this.findOne(tenantId, schemaName, id);
  }

  async update(
    tenantId: string,
    schemaName: string,
    id: string,
    dto: UpdatePosTerminalDto,
    updatedByUserId?: string,
  ): Promise<PosTerminalListItem> {
    const before = await this.findOne(tenantId, schemaName, id);

    if (dto.branchId) {
      await this.assertBranchExists(schemaName, dto.branchId);
    }
    if (dto.status && !isPosTerminalStatus(dto.status)) {
      throw new BadRequestException('Invalid terminal status');
    }

    const sets: string[] = [];
    const params: unknown[] = [tenantId, id];
    let paramIndex = 3;

    if (dto.displayName !== undefined) {
      sets.push(`display_name = $${paramIndex}`);
      params.push(dto.displayName.trim());
      paramIndex += 1;
    }
    if (dto.branchId !== undefined) {
      sets.push(`branch_id = $${paramIndex}::uuid`);
      params.push(dto.branchId);
      paramIndex += 1;
    }
    if (dto.status !== undefined) {
      sets.push(`status = $${paramIndex}`);
      params.push(dto.status);
      paramIndex += 1;
    }

    if (!sets.length) {
      return this.findOne(tenantId, schemaName, id);
    }

    sets.push('updated_at = CURRENT_TIMESTAMP');
    if (updatedByUserId) {
      sets.push(`updated_by_user_id = $${paramIndex}::uuid`);
      params.push(updatedByUserId);
      paramIndex += 1;
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."pos_devices"
       SET ${sets.join(', ')}
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      ...params,
    );

    const action =
      dto.status === 'inactive'
        ? 'pos_terminal_deactivated'
        : dto.status === 'active' && before.status === 'inactive'
          ? 'pos_terminal_activated'
          : 'pos_terminal_updated';
    this.recordTerminalMutation(
      tenantId,
      schemaName,
      id,
      action,
      updatedByUserId,
      {
        displayName: dto.displayName ?? before.displayName,
        branchId: dto.branchId ?? before.branchId,
        status: dto.status ?? before.status,
      },
      dto.branchId ?? before.branchId,
    );

    return this.findOne(tenantId, schemaName, id);
  }

  async resetPassword(
    tenantId: string,
    schemaName: string,
    id: string,
    password: string,
    updatedByUserId?: string,
  ): Promise<PosTerminalListItem> {
    await this.findOne(tenantId, schemaName, id);
    const setupPasswordHash = await bcrypt.hash(password, SETUP_PASSWORD_ROUNDS);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."pos_devices"
       SET setup_password_hash = $3,
           device_secret_hash = NULL,
           binding_status = 'unbound',
           device_fingerprint = NULL,
           bound_at = NULL,
           revoked_at = NULL,
           updated_by_user_id = $4::uuid,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      tenantId,
      id,
      setupPasswordHash,
      updatedByUserId ?? null,
    );

    this.logger.log(
      JSON.stringify({
        kind: 'pos_terminal_password_reset',
        tenantId,
        terminalId: id,
      }),
    );

    this.recordTerminalMutation(
      tenantId,
      schemaName,
      id,
      'pos_terminal_password_reset',
      updatedByUserId,
      { bindingStatus: 'unbound' },
    );

    return this.findOne(tenantId, schemaName, id);
  }

  async revokeBinding(
    tenantId: string,
    schemaName: string,
    id: string,
    updatedByUserId?: string,
  ): Promise<PosTerminalListItem> {
    await this.findOne(tenantId, schemaName, id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "public"."pos_devices"
       SET device_secret_hash = NULL,
           binding_status = 'revoked',
           device_fingerprint = NULL,
           revoked_at = CURRENT_TIMESTAMP,
           updated_by_user_id = $3::uuid,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      tenantId,
      id,
      updatedByUserId ?? null,
    );

    this.logger.log(
      JSON.stringify({
        kind: 'pos_terminal_binding_revoked',
        tenantId,
        terminalId: id,
      }),
    );

    this.recordTerminalMutation(
      tenantId,
      schemaName,
      id,
      'pos_terminal_binding_revoked',
      updatedByUserId,
      { bindingStatus: 'revoked' },
    );

    return this.findOne(tenantId, schemaName, id);
  }

  async deactivate(
    tenantId: string,
    schemaName: string,
    id: string,
    updatedByUserId?: string,
  ): Promise<PosTerminalListItem> {
    return this.update(
      tenantId,
      schemaName,
      id,
      { status: 'inactive' },
      updatedByUserId,
    );
  }

  async reactivate(
    tenantId: string,
    schemaName: string,
    id: string,
    updatedByUserId?: string,
  ): Promise<PosTerminalListItem> {
    return this.update(
      tenantId,
      schemaName,
      id,
      { status: 'active' },
      updatedByUserId,
    );
  }
}
