import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { encryptTenantDatabaseUrl } from './tenant-database-url.crypto';
import {
  createProvisioningTenant,
  findTenantConflict,
  updateTenantControl,
} from './tenant-control.repository';
import { randomBytes, randomUUID } from 'crypto';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { runTenantPrismaMigrate } from './run-tenant-prisma-migrate';
import { usesSharedDatabaseOwner } from './tenant-database-provision-mode';
import { seedTenantErpDefaults } from './tenant-erp-defaults.seed';
import type { ControlTenantRecord } from './tenant.types';

export type ProvisionDatabaseTenantInput = {
  name: string;
  slug: string;
  subdomain?: string;
  customDomain?: string;
  domains?: string[];
  ownerUserId?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

const SLUG_RE = /^[a-z0-9_]+$/;

type ProvisioningJobContext = {
  tenant: ControlTenantRecord;
  slug: string;
  databaseName: string;
  databaseUser: string;
  password: string;
  input: ProvisionDatabaseTenantInput;
};

@Injectable()
export class TenantDatabaseProvisionerService {
  private readonly logger = new Logger(TenantDatabaseProvisionerService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Creates the control row and returns immediately; heavy work runs in the background. */
  async provisionAsync(input: ProvisionDatabaseTenantInput) {
    const job = await this.startProvisioning(input);
    this.logger.log(
      `Tenant ${job.tenant.id} (${job.slug}) queued for background provisioning`,
    );
    this.scheduleProvisioning(job);
    return { ...job.tenant, domains: [] as { id: string; domain: string }[] };
  }

  /** Runs the full provisioning flow synchronously (CLI / tests). */
  async provision(input: ProvisionDatabaseTenantInput) {
    const job = await this.startProvisioning(input);
    return this.executeProvisioning(job);
  }

  private scheduleProvisioning(job: ProvisioningJobContext): void {
    const tenantId = job.tenant.id;
    if (this.inFlight.has(tenantId)) return;
    this.inFlight.add(tenantId);
    setImmediate(() => {
      void this.executeProvisioning(job)
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Background tenant provisioning failed for ${job.slug}: ${message}`,
            err instanceof Error ? err.stack : undefined,
          );
        })
        .finally(() => {
          this.inFlight.delete(tenantId);
        });
    });
  }

  private async startProvisioning(
    input: ProvisionDatabaseTenantInput,
  ): Promise<ProvisioningJobContext> {
    const slug = this.assertSafeSlug(input.slug);
    const databaseName = this.databaseNameForSlug(slug);
    const databaseUser = this.databaseUserForSlug(slug);
    const password = randomBytes(24).toString('base64url');
    const lockId = randomUUID();

    const tenant = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
        `tenant-provision:${slug}`,
      );

      const existing = await findTenantConflict(tx, {
        schemaName: slug,
        slug,
        subdomain: input.subdomain ?? slug,
        databaseName,
      });
      if (existing) {
        throw new ConflictException('Tenant slug or database already exists');
      }

      return createProvisioningTenant(tx, {
        name: input.name,
        schemaName: slug,
        slug,
        subdomain: input.subdomain ?? slug,
        customDomain: input.customDomain,
        databaseName,
        status: 'pending_setup',
        provisioningStatus: 'pending_setup',
        provisioningLockId: lockId,
        provisioningStartedAt: new Date(),
        ownerUserId: input.ownerUserId,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
      });
    });

    return {
      tenant,
      slug,
      databaseName,
      databaseUser,
      password,
      input,
    };
  }

  private async executeProvisioning(job: ProvisioningJobContext) {
    const { tenant, slug, databaseName, databaseUser, password, input } = job;
    const tenantId = tenant.id;
    let stage:
      | 'database'
      | 'user'
      | 'migration'
      | 'seed'
      | 'owner'
      | 'health' = 'database';

    this.logger.debug(
      `Provisioning steps started for ${slug} (tenantId=${tenantId}, db=${databaseName})`,
    );

    try {
      await this.createDatabase(databaseName);
      await this.mark(tenantId, 'pending_setup', 'db_created');

      stage = 'user';
      if (this.usesSharedOwner()) {
        this.logger.debug(
          `Skipping per-tenant role grants for ${slug} (shared database owner)`,
        );
      } else {
        await this.createOrUpdateUser(databaseUser, password);
        await this.grantTenantDatabase(databaseName, databaseUser);
        await this.grantTenantPublicSchema(databaseName, databaseUser);
      }
      await this.mark(tenantId, 'pending_setup', 'user_created');

      const databaseUrl = this.buildTenantDatabaseUrl(
        databaseName,
        databaseUser,
        password,
      );
      await updateTenantControl(this.prisma, tenantId, {
        databaseUrlEncrypted: encryptTenantDatabaseUrl(databaseUrl),
        databaseHealthStatus: 'not_checked',
        migrationStatus: 'pending',
      });

      stage = 'migration';
      await runTenantPrismaMigrate(databaseUrl);
      await this.recordMigrationRun(
        tenantId,
        'tenant:migrate:provision',
        'success',
      );
      await this.mark(tenantId, 'pending_setup', 'migrated');

      stage = 'seed';
      await seedTenantErpDefaults(databaseUrl);
      await this.seedTenantDefaults(databaseUrl);
      await this.mark(tenantId, 'pending_setup', 'seeded');

      stage = 'owner';
      const ownerUserId = await this.createOwnerUser(databaseUrl, {
        name: input.ownerName,
        email: input.ownerEmail,
        password: input.ownerPassword,
      });
      await updateTenantControl(this.prisma, tenantId, {
        ownerUserId,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
      });
      await this.mark(tenantId, 'pending_setup', 'owner_created');

      stage = 'health';
      const health = await this.verifyReadyForActivation(databaseUrl, {
        ownerEmail: input.ownerEmail,
      });
      await updateTenantControl(this.prisma, tenantId, {
        databaseHealthStatus: health.databaseHealthStatus,
        migrationStatus: health.migrationStatus,
        storageUsedBytes: health.storageUsedBytes,
      });
      await this.mark(tenantId, 'pending_setup', 'health_checked');

      if (input.domains?.length) {
        await this.prisma.domain.createMany({
          data: input.domains.map((domain) => ({
            tenantId,
            domain: domain.trim().toLowerCase(),
          })),
          skipDuplicates: true,
        });
      }

      const active = await updateTenantControl(this.prisma, tenantId, {
        status: 'active',
        provisioningStatus: 'active',
        provisioningLockId: null,
        databaseHealthStatus: 'connected',
        migrationStatus: 'up_to_date',
        errorMessage: null,
      });
      const domains = await this.prisma.domain.findMany({
        where: { tenantId },
      });
      this.logger.log(
        `Tenant "${input.name}" (${slug}) provisioned in background`,
      );
      return { ...active, domains };
    } catch (err) {
      const message = this.sanitizeErrorMessage(
        err instanceof Error ? err.message : String(err),
      );
      await this.recordMigrationRun(
        tenantId,
        'tenant:migrate:provision',
        'failed',
        message,
      ).catch(() => undefined);
      await updateTenantControl(this.prisma, tenantId, {
        status: stage === 'migration' ? 'migration_failed' : 'provisioning_failed',
        provisioningStatus: 'failed',
        provisioningLockId: null,
        databaseHealthStatus: stage === 'database' ? 'not_configured' : 'failed',
        migrationStatus: stage === 'migration' ? 'failed' : undefined,
        errorMessage: message,
      });
      this.logger.error(
        `Tenant provisioning failed for ${slug} (db=${this.databaseNameForSlug(slug)}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  assertSafeSlug(slug: string): string {
    const normalized = slug.trim().toLowerCase();
    if (!SLUG_RE.test(normalized)) {
      throw new BadRequestException(
        'Tenant slug must contain only lowercase letters, numbers, and underscores',
      );
    }
    return normalized;
  }

  databaseNameForSlug(slug: string): string {
    return `tenant_${this.assertSafeSlug(slug)}_db`;
  }

  databaseUserForSlug(slug: string): string {
    return `tenant_${this.assertSafeSlug(slug)}_user`;
  }

  /** Drop dedicated tenant PostgreSQL database and login role (best-effort). */
  async teardownDedicatedDatabase(
    databaseName: string,
    slug: string,
  ): Promise<void> {
    const pool = this.adminPool();
    try {
      const db = this.escapeIdentifier(databaseName);
      await pool.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
      this.logger.warn(`Dropped tenant database ${databaseName}`);
      if (!this.usesSharedOwner()) {
        const databaseUser = this.databaseUserForSlug(slug);
        const user = this.escapeIdentifier(databaseUser);
        await pool.query(`DROP ROLE IF EXISTS "${user}"`);
        this.logger.warn(`Dropped tenant role ${databaseUser}`);
      }
    } finally {
      await pool.end();
    }
  }

  private usesSharedOwner(): boolean {
    return usesSharedDatabaseOwner(this.config);
  }

  private async mark(
    tenantId: string,
    status: string,
    provisioningStatus: string,
  ): Promise<void> {
    await updateTenantControl(this.prisma, tenantId, {
      status,
      provisioningStatus,
    });
  }

  private adminUrl(): string {
    const value = this.config.get<string>('TENANT_DB_ADMIN_URL')?.trim();
    if (!value) {
      throw new Error(
        'TENANT_DB_ADMIN_URL is required to provision tenant DBs',
      );
    }
    return value;
  }

  private adminPool(): Pool {
    return new Pool({
      connectionString: this.adminUrl(),
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    });
  }

  private async createDatabase(databaseName: string): Promise<void> {
    const pool = this.adminPool();
    try {
      const existing = await pool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [databaseName],
      );
      if (existing.rowCount && existing.rowCount > 0) return;
      await pool.query(
        `CREATE DATABASE "${this.escapeIdentifier(databaseName)}"`,
      );
    } finally {
      await pool.end();
    }
  }

  private async createOrUpdateUser(
    databaseUser: string,
    password: string,
  ): Promise<void> {
    const pool = this.adminPool();
    try {
      const user = this.escapeIdentifier(databaseUser);
      const pass = this.escapeLiteral(password);
      await pool.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${this.escapeLiteral(databaseUser)}') THEN
    CREATE ROLE "${user}" LOGIN PASSWORD '${pass}';
  ELSE
    ALTER ROLE "${user}" WITH LOGIN PASSWORD '${pass}';
  END IF;
END $$`);
    } finally {
      await pool.end();
    }
  }

  private async grantTenantDatabase(
    databaseName: string,
    databaseUser: string,
  ): Promise<void> {
    const pool = this.adminPool();
    try {
      const db = this.escapeIdentifier(databaseName);
      const user = this.escapeIdentifier(databaseUser);
      await pool.query(`GRANT ALL PRIVILEGES ON DATABASE "${db}" TO "${user}"`);
      await pool.query(`ALTER DATABASE "${db}" OWNER TO "${user}"`);
    } finally {
      await pool.end();
    }
  }

  private async grantTenantPublicSchema(
    databaseName: string,
    databaseUser: string,
  ): Promise<void> {
    const url = new URL(this.adminUrl());
    url.pathname = `/${databaseName}`;
    const pool = new Pool({
      connectionString: url.toString(),
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    });
    try {
      const user = this.escapeIdentifier(databaseUser);
      await pool.query(`GRANT ALL ON SCHEMA public TO "${user}"`);
      await pool.query(`ALTER SCHEMA public OWNER TO "${user}"`);
      await pool.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${user}"`,
      );
      await pool.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${user}"`,
      );
    } finally {
      await pool.end();
    }
  }

  private buildTenantDatabaseUrl(
    databaseName: string,
    databaseUser: string,
    password: string,
  ): string {
    const url = new URL(this.adminUrl());
    if (!this.usesSharedOwner()) {
      url.username = databaseUser;
      url.password = password;
    }
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  private async seedTenantDefaults(databaseUrl: string): Promise<void> {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    });
    try {
      await pool.query(`
INSERT INTO roles (name, is_system_role)
VALUES ('admin', true), ('manager', true), ('pharmacist', true), ('cashier', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name)
VALUES
  ('create_product'), ('edit_product'), ('delete_product'),
  ('view_products'), ('view_sales'), ('create_sale'),
  ('view_purchases'), ('create_purchase'), ('view_roles'),
  ('view_pos_terminals'), ('manage_pos_terminals')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO branches (name, code)
SELECT 'Main Branch', 'MAIN'
WHERE NOT EXISTS (SELECT 1 FROM branches);

INSERT INTO uoms (code, name, symbol)
VALUES ('PCS', 'Piece', 'PCS'), ('TAB', 'Tablet', 'TAB')
ON CONFLICT (code) DO NOTHING;

INSERT INTO price_groups (code, name, is_default, active)
VALUES ('RETAIL', 'Retail', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;`);
    } finally {
      await pool.end();
    }
  }

  private async createOwnerUser(
    databaseUrl: string,
    input: { name: string; email: string; password: string },
  ): Promise<string> {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    });
    try {
      const email = input.email.trim().toLowerCase();
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [email],
      );
      if (existing.rows[0]?.id) {
        return existing.rows[0].id;
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO users (name, email, password, role_id)
         VALUES (
           $1,
           $2,
           $3,
           (SELECT id FROM roles WHERE lower(name) = 'admin' LIMIT 1)
         )
         RETURNING id`,
        [input.name.trim(), email, passwordHash],
      );
      const ownerId = inserted.rows[0]?.id;
      if (!ownerId) {
        throw new Error('Failed to create tenant owner user');
      }
      return ownerId;
    } finally {
      await pool.end();
    }
  }

  private async verifyReadyForActivation(
    databaseUrl: string,
    input: { ownerEmail: string },
  ): Promise<{
    databaseHealthStatus: 'connected';
    migrationStatus: 'up_to_date';
    storageUsedBytes: bigint;
  }> {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    });
    try {
      await pool.query('SELECT 1');

      const migrationFailures = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM _prisma_migrations
         WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
      );
      if (Number.parseInt(migrationFailures.rows[0]?.count ?? '0', 10) > 0) {
        throw new Error('Tenant migrations are not complete');
      }

      const ownerRows = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [input.ownerEmail.trim().toLowerCase()],
      );
      if (!ownerRows.rows[0]?.id) {
        throw new Error('Tenant owner user is missing');
      }

      const settingsRows = await pool.query<{ id: string }>(
        `SELECT id FROM tenant_settings LIMIT 1`,
      );
      if (!settingsRows.rows[0]?.id) {
        throw new Error('Tenant default settings are missing');
      }

      const sizeRows = await pool.query<{ bytes: string }>(
        `SELECT pg_database_size(current_database())::text AS bytes`,
      );

      return {
        databaseHealthStatus: 'connected',
        migrationStatus: 'up_to_date',
        storageUsedBytes: BigInt(sizeRows.rows[0]?.bytes ?? '0'),
      };
    } finally {
      await pool.end();
    }
  }

  private async recordMigrationRun(
    tenantId: string,
    migrationName: string,
    status: 'success' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "public"."tenant_migration_runs"
         (tenant_id, migration_name, status, started_at, finished_at, error_message)
       VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
      tenantId,
      migrationName,
      status,
      errorMessage ?? null,
    );
  }

  private escapeIdentifier(value: string): string {
    return value.replace(/"/g, '""');
  }

  private escapeLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  private sanitizeErrorMessage(message: string): string {
    return message.replace(
      /postgres(?:ql)?:\/\/[^\s'"]+/gi,
      'postgresql://***',
    );
  }
}
