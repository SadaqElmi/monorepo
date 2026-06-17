import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import { PrismaService } from '../prisma/prisma.service';
import {
  getTenantControlById,
  updateTenantControl,
} from '../tenant/tenant-control.repository';
import { tenantControlFromSql } from '../tenant/tenant-control.schema';
import { decryptTenantDatabaseUrl } from '../tenant/tenant-database-url.crypto';
import { runTenantPrismaMigrate } from '../tenant/run-tenant-prisma-migrate';
import { seedTenantBaseDefaults } from '../tenant/tenant-base-defaults.seed';
import { seedTenantErpDefaults } from '../tenant/tenant-erp-defaults.seed';
import { TenantService } from '../tenant/tenant.service';
import type { ControlTenantRecord } from '../tenant/tenant.types';

export type AdminActor = {
  adminUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AdminTenantListInput = {
  limit?: number;
  offset?: number;
  search?: string;
};

export type AdminTenantSummary = {
  id: string;
  name: string;
  schemaName: string;
  slug: string | null;
  status: string;
  ownerName: string | null;
  ownerEmail: string | null;
  provisioningStatus: string | null;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastLoginAt: Date | null;
  hasDatabaseUrl: boolean;
  databaseName: string | null;
  databaseHealthStatus: string;
  migrationStatus: string;
  storageUsed: number;
  posTerminalCount: number;
  lastBackupAt: Date | null;
};

export type AdminTenantListResult = {
  items: AdminTenantSummary[];
  total: number;
  limit: number;
  offset: number;
};

type AdminTenantRow = {
  id: string;
  name: string;
  schema_name: string;
  slug: string | null;
  status: string;
  owner_name: string | null;
  owner_email: string | null;
  provisioning_status: string | null;
  error_message: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  last_login_at: Date | null;
  database_name: string | null;
  database_health_status: string | null;
  migration_status: string | null;
  storage_used_bytes: string | bigint | number | null;
  last_backup_at: Date | null;
  has_database_url: boolean;
  pos_terminal_count: string | bigint | number;
};

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async listTenants(
    input: AdminTenantListInput = {},
  ): Promise<AdminTenantListResult> {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const search = input.search?.trim() ?? '';
    const fromSql = await tenantControlFromSql(this.prisma);
    const params: unknown[] = [];
    let paramIndex = 1;
    let searchClause = '';

    if (search) {
      searchClause = `WHERE (
        t.name ILIKE $${paramIndex}
        OR COALESCE(t.slug, '') ILIKE $${paramIndex}
        OR t.schema_name ILIKE $${paramIndex}
        OR COALESCE(t.owner_name, '') ILIKE $${paramIndex}
        OR COALESCE(t.owner_email, '') ILIKE $${paramIndex}
        OR t.id::text ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex += 1;
    }

    const countRows = await this.prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM ${fromSql} t
       ${searchClause}`,
      ...params,
    );
    const total = this.numberFromDb(countRows[0]?.count);

    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const rows = await this.prisma.$queryRawUnsafe<AdminTenantRow[]>(
      `SELECT
         t.id,
         t.name,
         t.schema_name,
         t.slug,
         t.status,
         t.owner_name,
         t.owner_email,
         t.provisioning_status,
         t.error_message,
         t.created_at,
         t.updated_at,
         t.last_login_at,
         t.database_name,
         t.database_health_status,
         t.migration_status,
         COALESCE(t.storage_used_bytes, 0)::text AS storage_used_bytes,
         COALESCE(t.last_backup_at, latest_backup.requested_at) AS last_backup_at,
         (t.database_url_encrypted IS NOT NULL AND btrim(t.database_url_encrypted) <> '') AS has_database_url,
         COUNT(d.id)::text AS pos_terminal_count
       FROM ${fromSql} t
       LEFT JOIN public.pos_devices d ON d.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT requested_at
         FROM public.tenant_backup_jobs b
         WHERE b.tenant_id = t.id
         ORDER BY requested_at DESC
         LIMIT 1
       ) latest_backup ON true
       ${searchClause}
       GROUP BY t.id, latest_backup.requested_at
       ORDER BY t.created_at DESC NULLS LAST, t.name ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      ...params,
      limit,
      offset,
    );

    return {
      items: rows.map((row) => this.mapTenantRow(row)),
      total,
      limit,
      offset,
    };
  }

  async getTenant(id: string) {
    const rows = await this.loadAdminTenantRows(id);
    const row = rows[0];
    if (!row) throw new NotFoundException('Tenant not found');
    return this.mapTenantRow(row);
  }

  async createTenant(
    input: {
      name: string;
      ownerName: string;
      ownerEmail: string;
      domain?: string;
      schemaName?: string;
      slug?: string;
      subdomain?: string;
      customDomain?: string;
      domains?: string[];
    },
    actor: AdminActor,
  ) {
    const temporaryOwnerPassword = this.generateTemporaryPassword();
    let tenantId: string | null = null;
    try {
      const tenant = await this.tenantService.create({
        name: input.name,
        domain: input.domain,
        schemaName: input.schemaName,
        slug: input.slug,
        subdomain: input.subdomain,
        customDomain: input.customDomain,
        domains: input.domains,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        ownerPassword: temporaryOwnerPassword,
      });
      tenantId = tenant.id;
      await this.recordAudit({
        actor,
        action: 'create_tenant',
        tenantId,
        result: 'success',
        payload: { ownerEmail: input.ownerEmail, slug: tenant.slug ?? null },
      });
      return {
        ...(await this.getTenant(tenant.id)),
        temporaryOwnerPassword,
      };
    } catch (err) {
      await this.recordAudit({
        actor,
        action: 'create_tenant',
        tenantId,
        result: 'failure',
        errorMessage: this.safeError(err),
        payload: { ownerEmail: input.ownerEmail, slug: input.slug ?? null },
      });
      throw err;
    }
  }

  async activateTenant(
    id: string,
    input: { ownerName?: string; ownerEmail?: string } = {},
    actor: AdminActor,
  ) {
    let temporaryOwnerPassword: string | undefined;
    const result = await this.auditMutation(
      'activate_tenant',
      id,
      actor,
      async () => {
        const tenant = await this.requireTenant(id);
        temporaryOwnerPassword = await this.assertReadyForActivation(
          tenant,
          input,
        );
        await updateTenantControl(this.prisma, id, {
          status: 'active',
          provisioningStatus: 'active',
          databaseHealthStatus: 'connected',
          migrationStatus: 'up_to_date',
          errorMessage: null,
        });
        return this.getTenant(id);
      },
      {
        ownerEmail: input.ownerEmail ?? null,
        ownerName: input.ownerName ?? null,
      },
    );
    return temporaryOwnerPassword
      ? { ...result, temporaryOwnerPassword }
      : result;
  }

  async assignTenantOwner(
    id: string,
    input: { ownerName: string; ownerEmail: string },
    actor: AdminActor,
  ) {
    let temporaryOwnerPassword: string | undefined;
    const result = await this.auditMutation(
      'assign_tenant_owner',
      id,
      actor,
      async () => {
        const tenant = await this.requireTenant(id);
        temporaryOwnerPassword = await this.provisionTenantOwner(
          tenant,
          input,
        );
        return this.getTenant(id);
      },
      {
        ownerEmail: input.ownerEmail,
        ownerName: input.ownerName,
      },
    );
    return temporaryOwnerPassword
      ? { ...result, temporaryOwnerPassword }
      : result;
  }

  async clearTenantOwner(id: string, actor: AdminActor) {
    const tenant = await this.requireTenant(id);
    if (!tenant.ownerEmail?.trim() && !tenant.ownerName?.trim()) {
      throw new BadRequestException('Tenant has no owner to remove');
    }

    return this.auditMutation(
      'clear_tenant_owner',
      id,
      actor,
      async () => {
        await updateTenantControl(this.prisma, id, {
          ownerUserId: null,
          ownerName: null,
          ownerEmail: null,
        });
        return this.getTenant(id);
      },
      {
        previousOwnerEmail: tenant.ownerEmail ?? null,
        previousOwnerName: tenant.ownerName ?? null,
      },
    );
  }

  async suspendTenant(id: string, actor: AdminActor) {
    return this.auditMutation('suspend_tenant', id, actor, async () => {
      await this.requireTenant(id);
      await updateTenantControl(this.prisma, id, { status: 'suspended' });
      return this.getTenant(id);
    });
  }

  async markTenantInactive(id: string, actor: AdminActor) {
    return this.auditMutation('mark_tenant_inactive', id, actor, async () => {
      await this.requireTenant(id);
      await updateTenantControl(this.prisma, id, { status: 'inactive' });
      return this.getTenant(id);
    });
  }

  async runMigration(id: string, actor: AdminActor) {
    return this.auditMutation('run_tenant_migration', id, actor, async () => {
      const tenant = await this.requireTenant(id);
      const databaseUrl = this.requireDatabaseUrl(tenant);
      try {
        await runTenantPrismaMigrate(databaseUrl);
        await this.recordMigrationRun(
          id,
          'tenant:migrate:admin',
          'success',
        );
        await updateTenantControl(this.prisma, id, {
          databaseHealthStatus: 'connected',
          migrationStatus: 'up_to_date',
          errorMessage: null,
        });
      } catch (err) {
        const message = this.safeError(err);
        await this.recordMigrationRun(
          id,
          'tenant:migrate:admin',
          'failed',
          message,
        ).catch(() => undefined);
        await updateTenantControl(this.prisma, id, {
          status: 'migration_failed',
          migrationStatus: 'failed',
          errorMessage: message,
        });
        throw err;
      }
      return this.getTenant(id);
    });
  }

  async getHealth(id: string) {
    const tenant = await this.requireTenant(id);
    const hasDatabaseUrl = Boolean(tenant.databaseUrlEncrypted?.trim());
    let databaseConnection: 'connected' | 'failed' | 'not_configured' =
      hasDatabaseUrl ? 'failed' : 'not_configured';
    let migrationStatus:
      | 'up_to_date'
      | 'pending'
      | 'failed'
      | 'unknown' = 'unknown';
    let storageUsed = this.numberFromDb(tenant.storageUsedBytes);
    const errors: string[] = [];

    if (tenant.errorMessage?.trim()) {
      errors.push(tenant.errorMessage.trim());
    }

    if (hasDatabaseUrl) {
      const databaseUrl = this.requireDatabaseUrl(tenant);
      const pool = this.tenantPool(databaseUrl);
      try {
        await pool.query('SELECT 1');
        databaseConnection = 'connected';
        migrationStatus = await this.readTenantMigrationStatus(pool);
        storageUsed = await this.readTenantStorageUsed(pool);
        await updateTenantControl(this.prisma, id, {
          databaseHealthStatus: 'connected',
          migrationStatus,
          storageUsedBytes: storageUsed,
        });
      } catch (err) {
        const message = this.safeError(err);
        databaseConnection = 'failed';
        migrationStatus =
          tenant.migrationStatus === 'failed' ? 'failed' : 'unknown';
        errors.push(message);
        await updateTenantControl(this.prisma, id, {
          databaseHealthStatus: 'failed',
          migrationStatus,
          errorMessage: tenant.status === 'active' ? message : tenant.errorMessage,
        }).catch(() => undefined);
        if (tenant.status === 'active') {
          await updateTenantControl(this.prisma, id, {
            status: 'inactive',
          }).catch(() => undefined);
        }
      } finally {
        await pool.end().catch(() => undefined);
      }
    }

    const summary = await this.getSafeSummary(id);
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      slug: tenant.slug ?? tenant.schemaName,
      status:
        tenant.status === 'active' && databaseConnection === 'failed'
          ? 'inactive'
          : tenant.status,
      hasDatabaseUrl,
      databaseConnection,
      migrationStatus,
      lastLoginAt: tenant.lastLoginAt ?? null,
      storageUsed,
      posTerminalCount: summary.posTerminalCount,
      lastBackupAt: summary.lastBackupAt,
      errors,
    };
  }

  async createBackup(id: string, actor: AdminActor) {
    return this.auditMutation('trigger_tenant_backup', id, actor, async () => {
      await this.requireTenant(id);
      const rows = await this.prisma.$queryRawUnsafe<
        { id: string; requested_at: Date }[]
      >(
        `INSERT INTO public.tenant_backup_jobs
           (tenant_id, requested_by_user_id, status, metadata)
         VALUES ($1::uuid, $2::uuid, 'accepted', $3::jsonb)
         RETURNING id, requested_at`,
        id,
        actor.adminUserId ?? null,
        JSON.stringify({ mode: 'audit_only' }),
      );
      const job = rows[0];
      if (!job) throw new BadRequestException('Failed to create backup job');
      await updateTenantControl(this.prisma, id, {
        lastBackupAt: job.requested_at,
      });
      return {
        jobId: job.id,
        tenantId: id,
        status: 'accepted',
        mode: 'audit_only',
        requestedAt: job.requested_at,
      };
    });
  }

  async getStorage(id: string) {
    const health = await this.getHealth(id);
    return {
      tenantId: id,
      storageUsed: health.storageUsed,
      databaseConnection: health.databaseConnection,
    };
  }

  async getLoginSummary(id: string) {
    const tenant = await this.requireTenant(id);
    return {
      tenantId: id,
      lastLoginAt: tenant.lastLoginAt ?? null,
      status: tenant.status,
    };
  }

  async listPosTerminals(id: string) {
    await this.requireTenant(id);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        display_name: string | null;
        terminal_username: string | null;
        status: string;
        binding_status: string;
        branch_id: string | null;
        last_seen_at: Date | null;
        last_heartbeat_at: Date | null;
        pending_outbox_count: number | null;
      }>
    >(
      `SELECT id, display_name, terminal_username, status, binding_status,
              branch_id, last_seen_at, last_heartbeat_at, pending_outbox_count
       FROM public.pos_devices
       WHERE tenant_id = $1::uuid
       ORDER BY updated_at DESC
       LIMIT 100`,
      id,
    );
    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      terminalUsername: row.terminal_username,
      status: row.status,
      bindingStatus: row.binding_status,
      branchId: row.branch_id,
      lastSeenAt: row.last_seen_at,
      lastHeartbeatAt: row.last_heartbeat_at,
      pendingOutboxCount: row.pending_outbox_count ?? 0,
    }));
  }

  async revokePosTerminalBinding(
    tenantId: string,
    terminalId: string,
    actor: AdminActor,
  ) {
    return this.auditMutation(
      'revoke_pos_terminal_binding',
      tenantId,
      actor,
      async () => {
        const [row] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
          `UPDATE public.pos_devices
           SET device_secret_hash = NULL,
               binding_status = 'revoked',
               device_fingerprint = NULL,
               revoked_at = CURRENT_TIMESTAMP,
               force_logout_at = CURRENT_TIMESTAMP,
               updated_by_user_id = $3::uuid,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1::uuid AND id = $2::uuid
           RETURNING id`,
          tenantId,
          terminalId,
          actor.adminUserId ?? null,
        );
        if (!row) throw new NotFoundException('POS terminal not found');
        return { ok: true, tenantId, terminalId, bindingStatus: 'revoked' };
      },
      { terminalId },
    );
  }

  async resetPosTerminalBinding(
    tenantId: string,
    terminalId: string,
    actor: AdminActor,
  ) {
    return this.auditMutation(
      'reset_pos_terminal_binding',
      tenantId,
      actor,
      async () => {
        const [row] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
          `UPDATE public.pos_devices
           SET device_secret_hash = NULL,
               binding_status = 'unbound',
               device_fingerprint = NULL,
               bound_at = NULL,
               revoked_at = NULL,
               force_logout_at = CURRENT_TIMESTAMP,
               updated_by_user_id = $3::uuid,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1::uuid AND id = $2::uuid
           RETURNING id`,
          tenantId,
          terminalId,
          actor.adminUserId ?? null,
        );
        if (!row) throw new NotFoundException('POS terminal not found');
        return { ok: true, tenantId, terminalId, bindingStatus: 'unbound' };
      },
      { terminalId },
    );
  }

  async listAuditLogs(input: { limit?: number; offset?: number }) {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        admin_user_id: string | null;
        action: string;
        tenant_id: string | null;
        result: string;
        error_message: string | null;
        ip_address: string | null;
        user_agent: string | null;
        payload: unknown;
        created_at: Date;
      }>
    >(
      `SELECT id, admin_user_id, action, tenant_id, result, error_message,
              ip_address::text, user_agent, payload, created_at
       FROM public.admin_audit_events
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );
    return rows.map((row) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      action: row.action,
      tenantId: row.tenant_id,
      result: row.result,
      errorMessage: row.error_message,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }

  private async loadAdminTenantRows(id?: string): Promise<AdminTenantRow[]> {
    const fromSql = await tenantControlFromSql(this.prisma);
    const where = id ? 'WHERE t.id = $1::uuid' : '';
    return this.prisma.$queryRawUnsafe<AdminTenantRow[]>(
      `SELECT
         t.id,
         t.name,
         t.schema_name,
         t.slug,
         t.status,
         t.owner_name,
         t.owner_email,
         t.provisioning_status,
         t.error_message,
         t.created_at,
         t.updated_at,
         t.last_login_at,
         t.database_name,
         t.database_health_status,
         t.migration_status,
         COALESCE(t.storage_used_bytes, 0)::text AS storage_used_bytes,
         COALESCE(t.last_backup_at, latest_backup.requested_at) AS last_backup_at,
         (t.database_url_encrypted IS NOT NULL AND btrim(t.database_url_encrypted) <> '') AS has_database_url,
         COUNT(d.id)::text AS pos_terminal_count
       FROM ${fromSql} t
       LEFT JOIN public.pos_devices d ON d.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT requested_at
         FROM public.tenant_backup_jobs b
         WHERE b.tenant_id = t.id
         ORDER BY requested_at DESC
         LIMIT 1
       ) latest_backup ON true
       ${where}
       GROUP BY t.id, latest_backup.requested_at
       ORDER BY t.created_at DESC NULLS LAST, t.name ASC`,
      ...(id ? [id] : []),
    );
  }

  private mapTenantRow(row: AdminTenantRow) {
    return {
      id: row.id,
      name: row.name,
      schemaName: row.schema_name,
      slug: row.slug,
      status: row.status,
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      provisioningStatus: row.provisioning_status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      hasDatabaseUrl: row.has_database_url,
      databaseName: this.resolveDatabaseName(row),
      databaseHealthStatus: this.resolveDatabaseHealth(row),
      migrationStatus: row.migration_status ?? 'unknown',
      storageUsed: this.numberFromDb(row.storage_used_bytes),
      posTerminalCount: this.numberFromDb(row.pos_terminal_count),
      lastBackupAt: row.last_backup_at,
    };
  }

  private resolveDatabaseName(row: AdminTenantRow): string | null {
    const configured = row.database_name?.trim();
    if (configured) return configured;

    const slug = (row.slug?.trim() || row.schema_name?.trim())?.toLowerCase();
    return slug ? `tenant_${slug}_db` : null;
  }

  private resolveDatabaseHealth(row: AdminTenantRow): string {
    const stored = row.database_health_status?.trim();
    if (stored) return stored;
    if (!row.has_database_url) return 'not_configured';
    if (row.status === 'active') return 'connected';
    return 'unknown';
  }

  private async requireTenant(id: string): Promise<ControlTenantRecord> {
    const tenant = await getTenantControlById(this.prisma, id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  private requireDatabaseUrl(tenant: ControlTenantRecord): string {
    if (!tenant.databaseUrlEncrypted?.trim()) {
      throw new BadRequestException('Tenant database URL is not configured');
    }
    return decryptTenantDatabaseUrl(tenant.databaseUrlEncrypted);
  }

  private async provisionTenantOwner(
    tenant: ControlTenantRecord,
    input: { ownerName: string; ownerEmail: string },
  ): Promise<string | undefined> {
    const databaseUrl = this.requireDatabaseUrl(tenant);
    const pool = this.tenantPool(databaseUrl);
    try {
      await pool.query('SELECT 1');
      await this.ensureTenantActivationPrerequisites(databaseUrl, pool);
      return await this.ensureTenantOwnerUser(
        pool,
        tenant,
        {
          ownerEmail: input.ownerEmail.trim(),
          ownerName: input.ownerName.trim(),
        },
        { resetPasswordIfExists: true },
      );
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async assertReadyForActivation(
    tenant: ControlTenantRecord,
    input: { ownerName?: string; ownerEmail?: string } = {},
  ): Promise<string | undefined> {
    const databaseUrl = this.requireDatabaseUrl(tenant);
    const pool = this.tenantPool(databaseUrl);
    try {
      await pool.query('SELECT 1');
      await this.ensureTenantActivationPrerequisites(databaseUrl, pool);
      const migrationStatus = await this.readTenantMigrationStatus(pool);
      if (migrationStatus !== 'up_to_date') {
        throw new BadRequestException('Tenant migrations are not complete');
      }
      const ownerEmail = await this.ensureTenantOwnerEmail(tenant, pool, input);
      const temporaryOwnerPassword = await this.ensureTenantOwnerUser(
        pool,
        tenant,
        {
          ownerEmail,
          ownerName:
            input.ownerName?.trim() ||
            tenant.ownerName?.trim() ||
            `${tenant.name.trim()} Owner`,
        },
        { resetPasswordIfExists: false },
      );
      await updateTenantControl(this.prisma, tenant.id, {
        databaseHealthStatus: 'connected',
        migrationStatus: 'up_to_date',
        storageUsedBytes: await this.readTenantStorageUsed(pool),
      });
      return temporaryOwnerPassword;
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async tenantTableExists(
    pool: Pool,
    tableName: string,
  ): Promise<boolean> {
    const rows = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = $1
       ) AS exists`,
      [tableName],
    );
    return Boolean(rows.rows[0]?.exists);
  }

  private async ensureTenantActivationPrerequisites(
    databaseUrl: string,
    pool: Pool,
  ): Promise<void> {
    if (!(await this.tenantTableExists(pool, 'tenant_settings'))) {
      this.logger.warn(
        'tenant_settings is missing; running tenant Prisma migrations',
      );
      await runTenantPrismaMigrate(databaseUrl);
    }

    let settings = await this.readTenantSettingsRow(pool);
    if (!settings?.id && (await this.tenantTableExists(pool, 'tenant_settings'))) {
      await seedTenantErpDefaults(databaseUrl);
      settings = await this.readTenantSettingsRow(pool);
    }

    if (!settings?.id) {
      throw new BadRequestException('Tenant default settings are missing');
    }

    await seedTenantBaseDefaults(databaseUrl);
  }

  private async readTenantSettingsRow(
    pool: Pool,
  ): Promise<{ id: string } | null> {
    if (!(await this.tenantTableExists(pool, 'tenant_settings'))) {
      return null;
    }
    const settings = await pool.query<{ id: string }>(
      `SELECT id FROM tenant_settings LIMIT 1`,
    );
    return settings.rows[0] ?? null;
  }

  private async ensureTenantOwnerEmail(
    tenant: ControlTenantRecord,
    pool: Pool,
    input: { ownerName?: string; ownerEmail?: string } = {},
  ): Promise<string> {
    const configured = tenant.ownerEmail?.trim() || input.ownerEmail?.trim();
    if (configured) {
      if (!tenant.ownerEmail?.trim()) {
        await updateTenantControl(this.prisma, tenant.id, {
          ownerEmail: configured,
          ...(input.ownerName?.trim() || tenant.ownerName?.trim()
            ? {
                ownerName:
                  input.ownerName?.trim() || tenant.ownerName?.trim() || null,
              }
            : {}),
        });
      }
      return configured;
    }

    let resolvedEmail: string | null = null;
    let resolvedUserId = tenant.ownerUserId?.trim() ?? null;
    let resolvedName =
      input.ownerName?.trim() || tenant.ownerName?.trim() || null;

    if (resolvedUserId) {
      const byId = await pool.query<{
        id: string;
        email: string | null;
        name: string | null;
      }>(
        `SELECT id, email, name
         FROM users
         WHERE id = $1::uuid
         LIMIT 1`,
        [resolvedUserId],
      );
      const row = byId.rows[0];
      resolvedEmail = row?.email?.trim() ?? null;
      if (!resolvedName && row?.name?.trim()) {
        resolvedName = row.name.trim();
      }
    }

    if (!resolvedEmail) {
      const adminRows = await pool.query<{
        id: string;
        email: string | null;
        name: string | null;
      }>(
        `SELECT u.id, u.email, u.name
         FROM users u
         INNER JOIN roles r ON r.id = u.role_id
         WHERE lower(r.name) = 'admin'
           AND u.email IS NOT NULL
           AND btrim(u.email) <> ''
         ORDER BY u.created_at ASC
         LIMIT 1`,
      );
      const admin = adminRows.rows[0];
      resolvedEmail = admin?.email?.trim() ?? null;
      resolvedUserId = resolvedUserId ?? admin?.id ?? null;
      if (!resolvedName && admin?.name?.trim()) {
        resolvedName = admin.name.trim();
      }
    }

    if (!resolvedEmail) {
      throw new BadRequestException(
        'Tenant owner email is not configured. Provide ownerName and ownerEmail when activating.',
      );
    }

    await updateTenantControl(this.prisma, tenant.id, {
      ownerEmail: resolvedEmail,
      ...(resolvedUserId ? { ownerUserId: resolvedUserId } : {}),
      ...(resolvedName ? { ownerName: resolvedName } : {}),
    });

    return resolvedEmail;
  }

  private async ensureTenantOwnerUser(
    pool: Pool,
    tenant: ControlTenantRecord,
    input: { ownerEmail: string; ownerName: string },
    options: { resetPasswordIfExists?: boolean } = {},
  ): Promise<string | undefined> {
    const email = input.ownerEmail.trim().toLowerCase();
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    if (existing.rows[0]?.id) {
      let temporaryOwnerPassword: string | undefined;
      const updateParams: unknown[] = [email, input.ownerName.trim()];
      let passwordClause = '';
      if (options.resetPasswordIfExists) {
        temporaryOwnerPassword = this.generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(temporaryOwnerPassword, 10);
        passwordClause = 'password = $3,';
        updateParams.push(passwordHash);
      }
      await pool.query(
        `UPDATE users
         SET
           name = $2,
           ${passwordClause}
           role_id = COALESCE(
             role_id,
             (SELECT id FROM roles WHERE lower(name) = 'admin' LIMIT 1)
           ),
           branch_id = COALESCE(
             branch_id,
             (SELECT id FROM branches ORDER BY created_at ASC, name ASC LIMIT 1)
           )
         WHERE lower(email) = lower($1)`,
        updateParams,
      );
      await updateTenantControl(this.prisma, tenant.id, {
        ownerUserId: existing.rows[0].id,
        ownerEmail: email,
        ownerName: input.ownerName.trim(),
      });
      return temporaryOwnerPassword;
    }

    const temporaryOwnerPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryOwnerPassword, 10);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password, role_id, branch_id)
       VALUES (
         $1,
         $2,
         $3,
         (SELECT id FROM roles WHERE lower(name) = 'admin' LIMIT 1),
         (SELECT id FROM branches ORDER BY created_at ASC, name ASC LIMIT 1)
       )
       RETURNING id`,
      [input.ownerName.trim(), email, passwordHash],
    );
    const ownerId = inserted.rows[0]?.id;
    if (!ownerId) {
      throw new BadRequestException('Failed to create tenant owner user');
    }

    await updateTenantControl(this.prisma, tenant.id, {
      ownerUserId: ownerId,
      ownerEmail: email,
      ownerName: input.ownerName.trim(),
    });

    return temporaryOwnerPassword;
  }

  private async readTenantMigrationStatus(
    pool: Pool,
  ): Promise<'up_to_date' | 'pending' | 'failed' | 'unknown'> {
    try {
      const rows = await pool.query<{ failed: string; pending: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::text AS pending,
           COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL)::text AS failed
         FROM _prisma_migrations`,
      );
      if (Number.parseInt(rows.rows[0]?.failed ?? '0', 10) > 0) {
        return 'failed';
      }
      if (Number.parseInt(rows.rows[0]?.pending ?? '0', 10) > 0) {
        return 'pending';
      }
      return 'up_to_date';
    } catch {
      return 'unknown';
    }
  }

  private async readTenantStorageUsed(pool: Pool): Promise<number> {
    const rows = await pool.query<{ bytes: string }>(
      `SELECT pg_database_size(current_database())::text AS bytes`,
    );
    return this.numberFromDb(rows.rows[0]?.bytes);
  }

  private async getSafeSummary(
    tenantId: string,
  ): Promise<{ posTerminalCount: number; lastBackupAt: Date | null }> {
    const [posRows, backupRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count
         FROM public.pos_devices
         WHERE tenant_id = $1::uuid`,
        tenantId,
      ),
      this.prisma.$queryRawUnsafe<{ requested_at: Date | null }[]>(
        `SELECT requested_at
         FROM public.tenant_backup_jobs
         WHERE tenant_id = $1::uuid
         ORDER BY requested_at DESC
         LIMIT 1`,
        tenantId,
      ),
    ]);
    return {
      posTerminalCount: this.numberFromDb(posRows[0]?.count),
      lastBackupAt: backupRows[0]?.requested_at ?? null,
    };
  }

  private tenantPool(databaseUrl: string): Pool {
    return new Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
  }

  private async auditMutation<T>(
    action: string,
    tenantId: string | null,
    actor: AdminActor,
    fn: () => Promise<T>,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const result = await fn();
      await this.recordAudit({
        actor,
        action,
        tenantId,
        result: 'success',
        payload,
      });
      return result;
    } catch (err) {
      await this.recordAudit({
        actor,
        action,
        tenantId,
        result: 'failure',
        errorMessage: this.safeError(err),
        payload,
      });
      throw err;
    }
  }

  private async recordAudit(input: {
    actor: AdminActor;
    action: string;
    tenantId?: string | null;
    result: 'success' | 'failure';
    errorMessage?: string | null;
    payload?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.admin_audit_events
           (admin_user_id, action, tenant_id, result, error_message, ip_address, user_agent, payload)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::inet, $7, $8::jsonb)`,
        input.actor.adminUserId ?? null,
        input.action,
        input.tenantId ?? null,
        input.result,
        input.errorMessage ?? null,
        input.actor.ipAddress ?? null,
        input.actor.userAgent ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
      );
    } catch (err) {
      this.logger.warn(
        `Admin audit write failed (${input.action}): ${this.safeError(err)}`,
      );
    }
  }

  private async recordMigrationRun(
    tenantId: string,
    migrationName: string,
    status: 'success' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.tenant_migration_runs
         (tenant_id, migration_name, status, started_at, finished_at, error_message)
       VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
      tenantId,
      migrationName,
      status,
      errorMessage ?? null,
    );
  }

  private generateTemporaryPassword(): string {
    return `${randomBytes(18).toString('base64url')}aA1!`;
  }

  private numberFromDb(value: unknown): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private safeError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    return message.replace(
      /postgres(?:ql)?:\/\/[^\s'"]+/gi,
      'postgresql://***',
    );
  }
}
