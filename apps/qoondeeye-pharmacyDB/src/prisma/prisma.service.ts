import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';
import {
  createPgPool,
  createPrismaPgFromPool,
  resolveDatabaseUrl,
} from './create-pg-adapter';

type TenantDatabaseDelegate = {
  withTenantDatabase<T>(
    schemaName: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
  shouldUseDedicatedDatabase(schemaName: string): Promise<boolean>;
};

type ActiveTenantSchemaResolver = () => string | null;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static tenantDatabaseDelegate: TenantDatabaseDelegate | null = null;
  private static activeTenantSchemaResolver: ActiveTenantSchemaResolver | null =
    null;
  private readonly logger = new Logger(PrismaService.name);
  private readonly pgPool: Pool;
  constructor(config: ConfigService) {
    const url = resolveDatabaseUrl(config);
    if (!url) {
      throw new Error(
        'Database URL required: set CONTROL_DATABASE_URL or DATABASE_URL in .env / .env.local',
      );
    }
    const pool = createPgPool(url);
    const adapter = createPrismaPgFromPool(pool);
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
    this.pgPool = pool;
    this.attachSlowQueryLogging();
  }

  static setTenantDatabaseDelegate(delegate: TenantDatabaseDelegate): void {
    PrismaService.tenantDatabaseDelegate = delegate;
  }

  /** Resolves tenant schema from request context for unqualified tenant SQL. */
  static setActiveTenantSchemaResolver(
    resolver: ActiveTenantSchemaResolver | null,
  ): void {
    PrismaService.activeTenantSchemaResolver = resolver;
  }

  private attachSlowQueryLogging(): void {
    const slowMs = (() => {
      const raw = process.env.PRISMA_SLOW_QUERY_MS;
      if (raw === undefined || raw === '') return 400;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 400;
    })();

    this.$on('query' as never, (event: { duration: number; target: string }) => {
      if (event.duration < slowMs) return;
      this.logger.warn(
        JSON.stringify({
          kind: 'prisma_slow_query',
          target: event.target,
          durationMs: event.duration,
        }),
      );
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensurePublicPosDevicesTable();
    this.logger.log('Database connected');
  }

  /**
   * Idempotent: matches prisma/migrations/20260422101500_pos_device_binding/migration.sql.
   * Heals dev DBs that never ran `prisma migrate deploy`.
   */
  private async ensurePublicPosDevicesTable(): Promise<void> {
    await this.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "public"."pos_devices" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "device_code" VARCHAR(128) NOT NULL,
        "display_name" VARCHAR(255),
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "device_secret_hash" VARCHAR(128) NOT NULL,
        "branch_id" UUID,
        "bound_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "last_seen_at" TIMESTAMP(6),
        "revoked_at" TIMESTAMP(6),
        "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "pos_devices_tenant_id_fkey"
          FOREIGN KEY ("tenant_id")
          REFERENCES "public"."Tenant"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )`,
    );
    await this.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pos_devices_device_code_key"
       ON "public"."pos_devices"("device_code")`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_status_idx"
       ON "public"."pos_devices"("tenant_id", "status")`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_device_code_idx"
       ON "public"."pos_devices"("tenant_id", "device_code")`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "public"."pos_devices"
         ADD COLUMN IF NOT EXISTS "terminal_username" VARCHAR(64),
         ADD COLUMN IF NOT EXISTS "setup_password_hash" TEXT,
         ADD COLUMN IF NOT EXISTS "binding_status" VARCHAR(20) NOT NULL DEFAULT 'unbound',
         ADD COLUMN IF NOT EXISTS "device_fingerprint" VARCHAR(128),
         ADD COLUMN IF NOT EXISTS "last_setup_attempt_at" TIMESTAMP(6),
         ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "public"."pos_devices"
         ALTER COLUMN "device_secret_hash" DROP NOT NULL`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "public"."pos_devices"
         ALTER COLUMN "bound_at" DROP NOT NULL,
         ALTER COLUMN "bound_at" DROP DEFAULT`,
    );
    await this.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pos_devices_terminal_username_key"
       ON "public"."pos_devices"("terminal_username")
       WHERE "terminal_username" IS NOT NULL`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "public"."pos_devices"
         ADD COLUMN IF NOT EXISTS "updated_by_user_id" UUID,
         ADD COLUMN IF NOT EXISTS "device_name" VARCHAR(255),
         ADD COLUMN IF NOT EXISTS "device_model" VARCHAR(128),
         ADD COLUMN IF NOT EXISTS "os_version" VARCHAR(64),
         ADD COLUMN IF NOT EXISTS "browser_version" VARCHAR(64),
         ADD COLUMN IF NOT EXISTS "last_ip" INET,
         ADD COLUMN IF NOT EXISTS "app_version" VARCHAR(32),
         ADD COLUMN IF NOT EXISTS "hardware_profile" JSONB,
         ADD COLUMN IF NOT EXISTS "disabled_at" TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS "force_logout_at" TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS "pending_outbox_count" INT DEFAULT 0,
         ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMPTZ`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_binding_status_idx"
       ON "public"."pos_devices"("tenant_id", "binding_status")`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_branch_id_idx"
       ON "public"."pos_devices"("tenant_id", "branch_id")`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_created_at_idx"
       ON "public"."pos_devices"("tenant_id", "created_at" DESC)`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_last_heartbeat_idx"
       ON "public"."pos_devices"("tenant_id", "last_heartbeat_at" DESC)`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pgPool.end();
    this.logger.log('Database disconnected');
  }

  /** Execute tenant-scoped work on the tenant's dedicated PostgreSQL database. */
  async withTenantSchema<T>(
    schemaName: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const delegate = PrismaService.tenantDatabaseDelegate;
    if (!delegate) {
      throw new Error(
        'Dedicated tenant database requires TenantPrismaService to be initialized',
      );
    }
    return delegate.withTenantDatabase(schemaName, fn);
  }

  /**
   * Clean search path - call after tenant-scoped operations
   */
  async resetSearchPath() {
    await this.$executeRaw(
      Prisma.sql`SELECT set_config('search_path', 'public', true)`,
    );
  }

  /** Tenant-scoped raw query (SELECT). Use inside withTenantSchema or after set_config. */
  queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) {
    return (this as unknown as PrismaClient).$queryRaw<T>(query, ...values);
  }

  /** Tenant-scoped raw query (unsafe). Routes via tenant DB or search_path when possible. */
  async queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]) {
    const schemaName = this.resolveTenantSchemaForRawSql(query);
    if (schemaName) {
      return this.runTenantScopedRawQuery<T>(schemaName, (tx) =>
        tx.$queryRawUnsafe<T>(query, ...values),
      );
    }
    return (this as unknown as PrismaClient).$queryRawUnsafe<T>(
      query,
      ...values,
    );
  }

  /** Tenant-scoped raw execute (unsafe). Routes via tenant DB or search_path when possible. */
  async executeRawUnsafe(query: string, ...values: unknown[]) {
    const schemaName = this.resolveTenantSchemaForRawSql(query);
    if (schemaName) {
      return this.runTenantScopedRawQuery(schemaName, (tx) =>
        tx.$executeRawUnsafe(query, ...values),
      );
    }
    return (this as unknown as PrismaClient).$executeRawUnsafe(query, ...values);
  }

  private resolveTenantSchemaForRawSql(query: string): string | null {
    return (
      this.extractSchemaNameFromRawSql(query) ??
      PrismaService.activeTenantSchemaResolver?.() ??
      null
    );
  }

  private async runTenantScopedRawQuery<T>(
    schemaName: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.withTenantSchema(schemaName, fn);
  }

  private extractSchemaNameFromRawSql(query: string): string | null {
    const match = query.match(/"([a-zA-Z0-9_]+)"\s*\.\s*"/);
    return match?.[1] ?? null;
  }
}
