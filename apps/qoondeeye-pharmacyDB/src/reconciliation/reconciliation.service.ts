import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuditLogService } from '../accounting/audit-log.service';
import { FinancialReportsService } from '../accounting/financial-reports.service';
import { JournalService } from '../accounting/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  compareDerivedToDb,
  deriveStateFromEvents,
  describeReplayMismatchesForLog,
} from '../transfers/replay/transfer-replay.util';
import {
  formatBranchInventoryEntityCode,
  formatBranchPairEntityCode,
  formatJournalEntityCode,
  formatTransferEntityCode,
} from './reconciliation-entity-meta';
import {
  severityBranchCrossMismatch,
  severityEventReplayMismatch,
  severityInventoryGlMismatch,
  severityJournalIntegrityFailure,
  severityJournalUnbalanced,
  severityPhaseFailure,
  severityTransferMissingJournal,
} from './reconciliation-severity.policy';
import {
  EPS_CROSS,
  EPS_INV_CRITICAL,
  EPS_INV_WARN,
  EPS_JOURNAL,
  type ReconciliationLogType,
  type ReconciliationSeverity,
} from './reconciliation.types';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import { reconciliationTenantTags } from '../cache/cache-tags';
import { stableCacheKeySegment } from '../cache/cache-keys';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';

/** Row returned from `findLogs` after enrichment (entity labels for UI). */
export type ReconciliationLogEnrichedItem = {
  id: string;
  runId: string;
  tenantId: string;
  type: string;
  entityId: string | null;
  severity: string;
  message: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  entityDisplay: string | null;
  entityCode: string | null;
};

type TransferCheckRow = {
  id: string;
  transfer_number: string | null;
  from_branch_id: string;
  to_branch_id: string;
  status: string;
  approval_state: string;
  is_reversed: boolean;
  shipped_journal_entry_id: string | null;
  receive_journal_entry_id: string | null;
  ship_reversal_journal_entry_id: string | null;
  receive_reversal_journal_entry_id: string | null;
};

type ReconciliationLogRawRow = {
  id: string;
  runId: string;
  tenantId: string;
  type: string;
  entityId: string | null;
  severity: string;
  message: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date | string;
};

@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  /**
   * Per-tenant in-process mutex for full reconciliation runs only.
   * Does not coordinate across multiple Node processes; use DB advisory locks for that.
   */
  private readonly fullRunLocks = new Map<string, Promise<void>>();
  private readonly cacheTtlMs = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly journals: JournalService,
    private readonly financialReports: FinancialReportsService,
    private readonly auditLog: AuditLogService,
    private readonly taggedCache: TaggedCacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /** Public-schema CRUD (`reconciliation_*`, `tenant`). */
  private get prismaPublic(): PrismaClient {
    return this.prisma;
  }

  /**
   * Serialize full reconciliation per tenant. `wait: false` throws if a run is in progress.
   */
  private async withFullRunLock<T>(
    tenantId: string,
    wait: boolean,
    body: () => Promise<T>,
  ): Promise<T> {
    const existing = this.fullRunLocks.get(tenantId);
    if (existing) {
      if (!wait) {
        throw new ConflictException('Reconciliation already running');
      }
      await existing;
    }
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    this.fullRunLocks.set(tenantId, done);
    try {
      return await body();
    } finally {
      resolveDone();
      if (this.fullRunLocks.get(tenantId) === done) {
        this.fullRunLocks.delete(tenantId);
      }
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensurePublicReconciliationTables();
    } catch (err) {
      this.logger.error(
        `Reconciliation DDL skipped or partial: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Prisma default is `Tenant`; older migrations used `tenants`. */
  private async resolvePublicTenantTableName(): Promise<
    'Tenant' | 'tenants' | null
  > {
    const rows = await this.prisma.$queryRawUnsafe<{ relname: string }[]>(
      `SELECT c.relname
       FROM pg_catalog.pg_class c
       INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname IN ('Tenant', 'tenants')`,
    );
    const set = new Set((rows ?? []).map((r) => r.relname));
    if (set.has('Tenant')) return 'Tenant';
    if (set.has('tenants')) return 'tenants';
    return null;
  }

  /**
   * Ensures public reconciliation tables exist. Mirrors
   * `prisma/migrations/20260415120000_reconciliation_engine/migration.sql` for dev DBs
   * where `prisma migrate deploy` cannot run (e.g. blocked by an earlier failed migration).
   */
  private async ensurePublicReconciliationTables(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "public"."reconciliation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(6),
    "status" VARCHAR(20) NOT NULL,
    "summary" JSONB,
    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
)`);
      await this.prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "public"."reconciliation_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "entity_id" VARCHAR(64),
    "severity" VARCHAR(16) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_logs_pkey" PRIMARY KEY ("id")
)`);
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "reconciliation_runs_tenant_id_started_at_idx"
         ON "public"."reconciliation_runs"("tenant_id", "started_at" DESC)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "reconciliation_logs_tenant_id_created_at_idx"
         ON "public"."reconciliation_logs"("tenant_id", "created_at" DESC)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "reconciliation_logs_run_id_idx"
         ON "public"."reconciliation_logs"("run_id")`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "reconciliation_logs_tenant_id_severity_idx"
         ON "public"."reconciliation_logs"("tenant_id", "severity")`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "reconciliation_logs_tenant_id_type_idx"
         ON "public"."reconciliation_logs"("tenant_id", "type")`,
      );
      await this.prisma.$executeRawUnsafe(`
DO $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reconciliation_logs_run_id_fkey') THEN
    ALTER TABLE "public"."reconciliation_logs"
      ADD CONSTRAINT "reconciliation_logs_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $f$`);

      const tenantTbl = await this.resolvePublicTenantTableName();
      if (tenantTbl === 'Tenant' || tenantTbl === 'tenants') {
        await this.prisma.$executeRawUnsafe(`
DO $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reconciliation_runs_tenant_id_fkey') THEN
    ALTER TABLE "public"."reconciliation_runs"
      ADD CONSTRAINT "reconciliation_runs_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."${tenantTbl}"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reconciliation_logs_tenant_id_fkey') THEN
    ALTER TABLE "public"."reconciliation_logs"
      ADD CONSTRAINT "reconciliation_logs_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."${tenantTbl}"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $f$`);
      } else {
        this.logger.warn(
          'Neither public."Tenant" nor public."tenants" exists; reconciliation rows will have no FK to tenant until the parent table is created.',
        );
      }

      await this.prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "public"."system_health_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "snapshot_hour" TIMESTAMP(6) NOT NULL,
    "check_key" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "summary" JSONB NOT NULL,
    "source_run_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "system_health_snapshots_unique" UNIQUE ("tenant_id", "snapshot_hour", "check_key")
)`);
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_health_snapshots_tenant_hour"
         ON "public"."system_health_snapshots"("tenant_id", "snapshot_hour" DESC)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_health_snapshots_check_hour"
         ON "public"."system_health_snapshots"("check_key", "snapshot_hour" DESC)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_health_snapshots_status_hour"
         ON "public"."system_health_snapshots"("status", "snapshot_hour" DESC)`,
      );
      if (tenantTbl === 'Tenant' || tenantTbl === 'tenants') {
        await this.prisma.$executeRawUnsafe(`
DO $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_health_snapshots_tenant_id_fkey') THEN
    ALTER TABLE "public"."system_health_snapshots"
      ADD CONSTRAINT "system_health_snapshots_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."${tenantTbl}"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $f$`);
      }

      this.logger.log('Public reconciliation tables are present');
    } catch (err) {
      this.logger.error(
        `Failed to ensure public reconciliation tables: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async runFullReconciliationForAllTenants(): Promise<void> {
    const tenants = await this.tenantService.findAll();
    for (const tenant of tenants) {
      if (tenant.status !== 'active') continue;
      try {
        await this.runFullReconciliation(tenant.id, { waitForLock: true });
      } catch (err) {
        this.logger.error(
          `Full reconciliation failed for tenant ${tenant.schemaName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async runHourlyIntegritySnapshotsForAllTenants(): Promise<void> {
    const tenants = await this.tenantService.findAll();
    for (const tenant of tenants) {
      if (tenant.status !== 'active') continue;
      try {
        await this.captureTenantHealthSnapshot(tenant.id, tenant.schemaName);
      } catch (err) {
        this.logger.warn(
          `Hourly integrity snapshot failed for tenant ${tenant.schemaName}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /** Deep audit chain scan (larger limit) — scheduled daily. */
  async runDailyIntegritySnapshotsForAllTenants(): Promise<void> {
    const tenants = await this.tenantService.findAll();
    for (const tenant of tenants) {
      if (tenant.status !== 'active') continue;
      try {
        await this.captureTenantHealthSnapshot(tenant.id, tenant.schemaName, {
          auditLimit: 100_000,
        });
      } catch (err) {
        this.logger.warn(
          `Daily integrity snapshot failed for tenant ${tenant.schemaName}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async captureTenantHealthSnapshot(
    tenantId: string,
    schemaName: string,
    options?: { auditLimit?: number },
  ): Promise<void> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const snapshotHour = new Date();
    snapshotHour.setMinutes(0, 0, 0);
    const asOfDate = snapshotHour.toISOString().slice(0, 10);
    const branchRows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text AS id FROM branches ORDER BY id`,
      ),
    );
    const branchIds = branchRows.map((row) => row.id);
    if (!branchIds.length) return;

    const [
      auditResult,
      readiness,
      invSync,
      mismatches,
      latestRun,
      consolidationCounts,
    ] = await Promise.all([
      this.auditLog.verifyChainInSchema({
        schemaName,
        branchIds,
        limit: options?.auditLimit ?? 20000,
      }),
      this.financialReports.getCloseReadiness(schemaName, branchIds, asOfDate),
      this.financialReports.inventoryGlSync(schemaName, branchIds, asOfDate),
      this.financialReports.listInterbranchMismatches(schemaName, branchIds),
      this.findLatestCompletedRun(tenantId),
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<Array<{ status: string; c: bigint }>>(
          `SELECT status, COUNT(*)::bigint AS c
           FROM consolidation_runs
           WHERE reversed_at IS NULL
           GROUP BY status`,
        ),
      ),
    ]);

    const invCritical = invSync.filter(
      (row) => row.severity === 'critical',
    ).length;
    const invWarning = invSync.filter(
      (row) => row.severity === 'warning',
    ).length;
    const mismatchCritical = mismatches.filter(
      (m) => m.kind !== 'in_transit',
    ).length;
    const payloads: Array<{
      checkKey: string;
      status: string;
      summary: Record<string, unknown>;
      sourceRunId: string | null;
    }> = [
      {
        checkKey: 'audit_verify',
        status: auditResult.valid ? 'clean' : 'critical',
        summary: {
          valid: auditResult.valid,
          checkedRows: auditResult.checkedRows,
          issueCount: auditResult.issues.length,
          lastHash: auditResult.lastHash,
        },
        sourceRunId: null,
      },
      {
        checkKey: 'close_readiness',
        status:
          readiness.status === 'CRITICAL'
            ? 'critical'
            : readiness.status === 'WARNING'
              ? 'warning'
              : 'clean',
        summary: {
          status: readiness.status,
          summary: readiness.summary,
        },
        sourceRunId: null,
      },
      {
        checkKey: 'inventory_gl_sync',
        status:
          invCritical > 0 ? 'critical' : invWarning > 0 ? 'warning' : 'clean',
        summary: {
          branchCount: invSync.length,
          critical: invCritical,
          warning: invWarning,
        },
        sourceRunId: null,
      },
      {
        checkKey: 'interbranch_mismatches',
        status:
          mismatchCritical > 0
            ? 'critical'
            : mismatches.length > 0
              ? 'warning'
              : 'clean',
        summary: {
          total: mismatches.length,
          critical: mismatchCritical,
        },
        sourceRunId: null,
      },
      {
        checkKey: 'latest_reconciliation',
        status: latestRun ? 'clean' : 'warning',
        summary: {
          runId: latestRun?.id ?? null,
          finishedAt: latestRun?.finishedAt?.toISOString() ?? null,
          status: latestRun?.status ?? null,
        },
        sourceRunId: latestRun?.id ?? null,
      },
      {
        checkKey: 'consolidation_runs',
        status: 'clean',
        summary: {
          byStatus: Object.fromEntries(
            (consolidationCounts ?? []).map((row) => [
              row.status,
              Number(row.c ?? 0),
            ]),
          ),
        },
        sourceRunId: null,
      },
    ];

    for (const payload of payloads) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.system_health_snapshots (
           tenant_id, snapshot_hour, check_key, status, summary, source_run_id, updated_at
         )
         VALUES ($1::uuid, $2::timestamptz, $3, $4, $5::jsonb, $6::uuid, CURRENT_TIMESTAMP)
         ON CONFLICT (tenant_id, snapshot_hour, check_key)
         DO UPDATE SET
           status = EXCLUDED.status,
           summary = EXCLUDED.summary,
           source_run_id = EXCLUDED.source_run_id,
           updated_at = CURRENT_TIMESTAMP`,
        tenantId,
        snapshotHour.toISOString(),
        payload.checkKey,
        payload.status,
        JSON.stringify(payload.summary),
        payload.sourceRunId,
      );
    }
  }

  /**
   * Scoped checks after ship/receive/reverse (transfer + event + linked journals for one id).
   */
  async runTransferScopeChecks(
    tenantId: string,
    schemaName: string,
    transferId: string,
  ): Promise<void> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const run = await this.prismaPublic.reconciliationRun.create({
      data: {
        tenantId,
        status: 'running',
        summary: Prisma.JsonNull,
      },
    });
    const startedAt = run.startedAt ?? new Date();
    const phaseErrors: Array<{ phase: string; message: string }> = [];
    const phaseDurationMs: Record<string, number> = {};
    let totalChecks = 0;
    try {
      const runPhase = async (
        phase: string,
        fn: () => Promise<number>,
      ): Promise<void> => {
        const t0 = Date.now();
        try {
          totalChecks += await fn();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          phaseErrors.push({ phase, message: msg });
          await this.appendLog(
            run.id,
            tenantId,
            'system',
            severityPhaseFailure(),
            `Phase ${phase} failed: ${msg}`,
            null,
            { phase, error: msg, entity_code: `Phase:${phase}` },
          );
        } finally {
          phaseDurationMs[phase] = Date.now() - t0;
        }
      };

      await runPhase('transfers', () =>
        this.checkTransfers(schemaName, run.id, tenantId, transferId),
      );
      await runPhase('event_replay', () =>
        this.checkEventReplay(schemaName, run.id, tenantId, transferId),
      );

      const finishedAt = new Date();
      const summary = await this.buildRunSummary(
        run.id,
        startedAt,
        finishedAt,
        totalChecks,
        phaseDurationMs,
        phaseErrors,
      );
      await this.prismaPublic.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          finishedAt,
          summary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      const branchIdsForCache = await this.prisma
        .withTenantSchema(schemaName, async (tx) => {
          const [r] = await tx.$queryRawUnsafe<
            { from_branch_id: string; to_branch_id: string }[]
          >(
            `SELECT from_branch_id::text, to_branch_id::text FROM stock_transfers WHERE id = $1::uuid`,
            transferId,
          );
          if (!r) return [] as string[];
          return [r.from_branch_id, r.to_branch_id];
        })
        .catch(() => [] as string[]);
      await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
        schemaName,
        branchIds: branchIdsForCache,
        tenantId,
      });
    } catch (err) {
      await this.prismaPublic.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          summary: {
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
      this.logger.warn(
        `Transfer scope reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async findLogs(params: {
    tenantId: string;
    runId?: string;
    severity?: 'critical' | 'warning' | 'info';
    type?: string;
    limit: number;
    offset: number;
    /** When set, only logs whose metadata references one of these branches (or type system). */
    allowedBranchIds?: string[];
  }): Promise<{ items: ReconciliationLogEnrichedItem[]; total: number }> {
    const where = {
      tenantId: params.tenantId,
      ...(params.runId?.trim() ? { runId: params.runId.trim() } : {}),
      ...(params.severity ? { severity: params.severity } : {}),
      ...(params.type ? { type: params.type } : {}),
    };

    const branchIds = params.allowedBranchIds?.filter(Boolean) ?? [];

    if (branchIds.length > 0) {
      const branchScopeSql = `(
        l.type = 'system'
        OR EXISTS (
          SELECT 1 FROM unnest($2::uuid[]) AS bid(b)
          WHERE (
            (l.metadata->>'branch_id' IS NOT NULL AND (l.metadata->>'branch_id')::uuid = bid.b)
            OR (l.metadata->>'from_branch_id' IS NOT NULL AND (l.metadata->>'from_branch_id')::uuid = bid.b)
            OR (l.metadata->>'to_branch_id' IS NOT NULL AND (l.metadata->>'to_branch_id')::uuid = bid.b)
          )
        )
      )`;
      const qParams: unknown[] = [params.tenantId, branchIds];
      const extra: string[] = [];
      if (params.runId?.trim()) {
        extra.push(`l.run_id = $${qParams.length + 1}::uuid`);
        qParams.push(params.runId.trim());
      }
      if (params.severity) {
        extra.push(`l.severity = $${qParams.length + 1}::varchar`);
        qParams.push(params.severity);
      }
      if (params.type) {
        extra.push(`l.type = $${qParams.length + 1}::varchar`);
        qParams.push(params.type);
      }
      const extraSql = extra.length ? `AND ${extra.join(' AND ')}` : '';
      const limitPos = qParams.length + 1;
      const offsetPos = qParams.length + 2;
      qParams.push(params.limit, params.offset);

      const baseWhere = `l.tenant_id = $1::uuid ${extraSql} AND ${branchScopeSql}`;

      const items = await this.prisma.$queryRawUnsafe<
        ReconciliationLogRawRow[]
      >(
        `SELECT l.id, l.run_id AS "runId", l.tenant_id AS "tenantId", l.type,
                l.entity_id AS "entityId", l.severity, l.message, l.metadata, l.created_at AS "createdAt"
         FROM public.reconciliation_logs l
         WHERE ${baseWhere}
         ORDER BY l.created_at DESC
         LIMIT $${limitPos} OFFSET $${offsetPos}`,
        ...qParams,
      );

      const [countRow] = await this.prisma.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM public.reconciliation_logs l
         WHERE ${baseWhere}`,
        ...qParams.slice(0, -2),
      );
      const total = Number(countRow?.c ?? 0);

      const normalized = items.map((r) => ({
        id: r.id,
        runId: r.runId,
        tenantId: r.tenantId,
        type: r.type,
        entityId: r.entityId ?? null,
        severity: r.severity,
        message: r.message,
        metadata: r.metadata,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt
            : new Date(String(r.createdAt)),
      }));
      const tenantRow = await this.prismaPublic.tenant.findUnique({
        where: { id: params.tenantId },
        select: { schemaName: true },
      });
      if (!tenantRow) {
        const itemsAs: ReconciliationLogEnrichedItem[] = normalized.map(
          (r) => ({
            ...r,
            entityDisplay: null,
            entityCode: null,
          }),
        );
        return { items: itemsAs, total };
      }
      const enriched = await this.enrichReconciliationLogItems(
        tenantRow.schemaName,
        normalized,
      );
      return { items: enriched, total };
    }

    const [items, total] = await Promise.all([
      this.prismaPublic.reconciliationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      this.prismaPublic.reconciliationLog.count({ where }),
    ]);

    const tenantRow = await this.prismaPublic.tenant.findUnique({
      where: { id: params.tenantId },
      select: { schemaName: true },
    });
    if (!tenantRow) {
      const itemsAs: ReconciliationLogEnrichedItem[] = items.map((r) => ({
        id: r.id,
        runId: r.runId,
        tenantId: r.tenantId,
        type: r.type,
        entityId: r.entityId,
        severity: r.severity,
        message: r.message,
        metadata: r.metadata,
        createdAt: r.createdAt,
        entityDisplay: null,
        entityCode: null,
      }));
      return { items: itemsAs, total };
    }
    const enriched = await this.enrichReconciliationLogItems(
      tenantRow.schemaName,
      items,
    );
    return { items: enriched, total };
  }

  private static isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.trim(),
    );
  }

  private asMetaRecord(
    m: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      return m;
    }
    return null;
  }

  private async enrichReconciliationLogItems(
    schemaName: string,
    items: Array<{
      id: string;
      runId: string;
      tenantId: string;
      type: string;
      entityId: string | null;
      severity: string;
      message: string;
      metadata: Prisma.JsonValue | null;
      createdAt: Date;
    }>,
  ): Promise<ReconciliationLogEnrichedItem[]> {
    const transferIds = new Set<string>();
    const journalIds = new Set<string>();
    const branchIds = new Set<string>();

    for (const row of items) {
      const eid = row.entityId?.trim() ?? '';
      if (!eid || !ReconciliationService.isUuid(eid)) {
        /* branch rows may have null entityId */
      } else {
        if (row.type === 'transfer' || row.type === 'event')
          transferIds.add(eid);
        if (row.type === 'journal') journalIds.add(eid);
        if (row.type === 'inventory') branchIds.add(eid);
      }
      const md = this.asMetaRecord(row.metadata);
      if (
        md?.branch_id &&
        typeof md.branch_id === 'string' &&
        ReconciliationService.isUuid(md.branch_id)
      ) {
        branchIds.add(md.branch_id);
      }
      if (row.type === 'branch' && md) {
        if (
          typeof md.from_branch_id === 'string' &&
          ReconciliationService.isUuid(md.from_branch_id)
        ) {
          branchIds.add(md.from_branch_id);
        }
        if (
          typeof md.to_branch_id === 'string' &&
          ReconciliationService.isUuid(md.to_branch_id)
        ) {
          branchIds.add(md.to_branch_id);
        }
      }
    }

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const transferMap = new Map<string, string | null>();
      if (transferIds.size > 0) {
        const ids = [...transferIds];
        const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
        const rows = await tx.$queryRawUnsafe<
          { id: string; transfer_number: string | null }[]
        >(
          `SELECT id, transfer_number FROM stock_transfers WHERE id IN (${ph})`,
          ...ids,
        );
        for (const r of rows ?? []) {
          transferMap.set(r.id, r.transfer_number);
        }
      }

      const journalMap = new Map<
        string,
        {
          entry_date: string;
          description: string | null;
          source_type: string | null;
        }
      >();
      if (journalIds.size > 0) {
        const ids = [...journalIds];
        const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
        const rows = await tx.$queryRawUnsafe<
          {
            id: string;
            entry_date: string;
            description: string | null;
            source_type: string | null;
          }[]
        >(
          `SELECT id, entry_date::text AS entry_date, description, source_type::text AS source_type
           FROM journal_entries WHERE id IN (${ph})`,
          ...ids,
        );
        for (const r of rows ?? []) {
          journalMap.set(r.id, {
            entry_date: r.entry_date,
            description: r.description,
            source_type: r.source_type,
          });
        }
      }

      const branchMap = new Map<string, string>();
      if (branchIds.size > 0) {
        const ids = [...branchIds];
        const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
        const rows = await tx.$queryRawUnsafe<
          { id: string; name: string | null }[]
        >(
          `SELECT id::text AS id, name FROM branches WHERE id IN (${ph})`,
          ...ids,
        );
        for (const r of rows ?? []) {
          const label = (r.name ?? '').trim() || r.id;
          branchMap.set(r.id, label);
        }
      }

      return items.map((row) => {
        const eid = row.entityId?.trim() ?? null;
        let entityDisplay: string | null = null;

        if ((row.type === 'transfer' || row.type === 'event') && eid) {
          const num = transferMap.get(eid)?.trim();
          entityDisplay = num
            ? `Transfer #${num}`
            : 'Transfer (open in Related for details)';
        } else if (row.type === 'journal' && eid) {
          const j = journalMap.get(eid);
          if (j) {
            const desc = (j.description ?? '').trim();
            const short = desc.length > 56 ? `${desc.slice(0, 56)}…` : desc;
            entityDisplay = short
              ? `Journal ${j.entry_date} — ${short}`
              : `Journal ${j.entry_date}`;
          } else {
            entityDisplay = 'Journal entry (open in Related for details)';
          }
        } else if (row.type === 'inventory' && eid) {
          const nm = branchMap.get(eid);
          entityDisplay = nm
            ? `Branch: ${nm}`
            : 'Branch (open inventory valuation for details)';
        } else if (row.type === 'branch') {
          const md = this.asMetaRecord(row.metadata);
          const fa =
            typeof md?.from_branch_id === 'string' ? md.from_branch_id : '';
          const ta =
            typeof md?.to_branch_id === 'string' ? md.to_branch_id : '';
          const fn = fa && branchMap.get(fa);
          const tn = ta && branchMap.get(ta);
          if (fn || tn) {
            entityDisplay = `${fn ?? 'Unknown'} → ${tn ?? 'Unknown'}`;
          } else {
            entityDisplay = 'Branch pair';
          }
        } else if (eid) {
          entityDisplay = 'Record (see message and metadata)';
        }

        const meta = this.asMetaRecord(row.metadata);
        let entityCode: string | null =
          meta &&
          typeof meta.entity_code === 'string' &&
          meta.entity_code.trim()
            ? meta.entity_code.trim()
            : null;
        if (!entityCode && (row.type === 'transfer' || row.type === 'event')) {
          const code = formatTransferEntityCode(
            transferMap.get(eid ?? '') ?? null,
          );
          entityCode = code;
        } else if (!entityCode && row.type === 'journal' && eid) {
          const j = journalMap.get(eid);
          if (j) {
            entityCode = formatJournalEntityCode(j.source_type, j.entry_date);
          }
        } else if (!entityCode && row.type === 'inventory' && eid) {
          const nm = branchMap.get(eid);
          if (nm) entityCode = formatBranchInventoryEntityCode(nm);
        } else if (!entityCode && row.type === 'branch') {
          const md = this.asMetaRecord(row.metadata);
          const fa =
            typeof md?.from_branch_id === 'string' ? md.from_branch_id : '';
          const ta =
            typeof md?.to_branch_id === 'string' ? md.to_branch_id : '';
          const fn = fa && branchMap.get(fa);
          const tn = ta && branchMap.get(ta);
          if (fn || tn) {
            entityCode = formatBranchPairEntityCode(
              fn ?? 'Unknown',
              tn ?? 'Unknown',
            );
          }
        }

        return { ...row, entityDisplay, entityCode };
      });
    });
  }

  async findLatestCompletedRun(tenantId: string) {
    const key = stableCacheKeySegment([
      'reconciliation',
      'latest_completed_run',
      tenantId,
    ]);
    return this.taggedCache.getOrSet(
      key,
      reconciliationTenantTags(tenantId),
      this.cacheTtlMs,
      () =>
        this.prismaPublic.reconciliationRun.findFirst({
          where: { tenantId, status: 'completed' },
          orderBy: { finishedAt: 'desc' },
        }),
    );
  }

  async listHealthSnapshots(params: {
    tenantId: string;
    fromTs?: string;
    toTs?: string;
    checkKey?: string;
    limit: number;
  }) {
    const lim = Math.min(500, Math.max(1, params.limit));
    const key = stableCacheKeySegment([
      'reconciliation',
      'health_snapshots',
      params.tenantId,
      params.fromTs?.trim() ?? '',
      params.toTs?.trim() ?? '',
      params.checkKey?.trim() ?? '',
      String(lim),
    ]);
    return this.taggedCache.getOrSet(
      key,
      reconciliationTenantTags(params.tenantId),
      this.cacheTtlMs,
      () => this.queryHealthSnapshotsUncached({ ...params, limit: lim }),
    );
  }

  private async queryHealthSnapshotsUncached(params: {
    tenantId: string;
    fromTs?: string;
    toTs?: string;
    checkKey?: string;
    limit: number;
  }) {
    return this.prisma.$queryRawUnsafe<
      Array<{
        snapshot_hour: Date;
        check_key: string;
        status: string;
        summary: Prisma.JsonValue;
        source_run_id: string | null;
      }>
    >(
      `SELECT snapshot_hour, check_key, status, summary, source_run_id::text
       FROM public.system_health_snapshots
       WHERE tenant_id = $1::uuid
         AND ($2::timestamptz IS NULL OR snapshot_hour >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR snapshot_hour <= $3::timestamptz)
         AND ($4::varchar IS NULL OR check_key = $4)
       ORDER BY snapshot_hour DESC, check_key ASC
       LIMIT $5`,
      params.tenantId,
      params.fromTs?.trim() ? params.fromTs.trim() : null,
      params.toTs?.trim() ? params.toTs.trim() : null,
      params.checkKey?.trim() ? params.checkKey.trim() : null,
      params.limit,
    );
  }

  async runFullReconciliation(
    tenantId: string,
    opts?: { waitForLock?: boolean; allowedBranchIds?: string[] },
  ): Promise<{
    runId: string;
    summary: Record<string, unknown>;
  }> {
    return this.withFullRunLock(tenantId, opts?.waitForLock ?? false, () =>
      this.runFullReconciliationUnlocked(tenantId, opts?.allowedBranchIds),
    );
  }

  private async runFullReconciliationUnlocked(
    tenantId: string,
    allowedBranchIds?: string[],
  ): Promise<{
    runId: string;
    summary: Record<string, unknown>;
  }> {
    const tenant = await this.prismaPublic.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    const schemaName = tenant.schemaName;
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    const run = await this.prismaPublic.reconciliationRun.create({
      data: {
        tenantId,
        status: 'running',
        summary: Prisma.JsonNull,
      },
    });
    const startedAt = run.startedAt ?? new Date();
    const phaseErrors: Array<{ phase: string; message: string }> = [];
    const phaseDurationMs: Record<string, number> = {};
    let totalChecks = 0;

    const runPhase = async (
      phase: string,
      fn: () => Promise<number>,
    ): Promise<void> => {
      const t0 = Date.now();
      try {
        totalChecks += await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        phaseErrors.push({ phase, message: msg });
        await this.appendLog(
          run.id,
          tenantId,
          'system',
          severityPhaseFailure(),
          `Phase ${phase} failed: ${msg}`,
          null,
          { phase, error: msg, entity_code: `Phase:${phase}` },
        );
      } finally {
        phaseDurationMs[phase] = Date.now() - t0;
      }
    };

    try {
      await runPhase('transfers', () =>
        this.checkTransfers(
          schemaName,
          run.id,
          tenantId,
          undefined,
          allowedBranchIds,
        ),
      );
      await runPhase('journals', () =>
        this.checkJournals(schemaName, run.id, tenantId, allowedBranchIds),
      );
      await runPhase('cross_branch', () =>
        this.checkCrossBranchPairs(
          schemaName,
          run.id,
          tenantId,
          allowedBranchIds,
        ),
      );
      await runPhase('inventory', () =>
        this.checkInventoryVsGl(schemaName, run.id, tenantId, allowedBranchIds),
      );
      await runPhase('event_replay', () =>
        this.checkEventReplay(
          schemaName,
          run.id,
          tenantId,
          undefined,
          allowedBranchIds,
        ),
      );

      const finishedAt = new Date();
      const summaryBase = await this.buildRunSummary(
        run.id,
        startedAt,
        finishedAt,
        totalChecks,
        phaseDurationMs,
        phaseErrors,
      );
      const summary = {
        ...summaryBase,
        branchScope:
          allowedBranchIds && allowedBranchIds.length > 0
            ? allowedBranchIds
            : 'all_branches',
      };
      await this.prismaPublic.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          finishedAt,
          summary: summary,
        },
      });

      await this.cacheInvalidation.invalidateReconciliationForTenant(tenantId);
      if (allowedBranchIds?.length) {
        await this.cacheInvalidation.invalidateFinancialForBranches(
          schemaName,
          allowedBranchIds,
        );
      }

      this.logger.log(
        `Reconciliation completed for ${schemaName} run ${run.id}`,
      );
      return { runId: run.id, summary };
    } catch (err) {
      await this.prismaPublic.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          summary: {
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
      throw err;
    }
  }

  private async buildRunSummary(
    runId: string,
    startedAt: Date,
    finishedAt: Date,
    totalChecks: number,
    phaseDurationMs: Record<string, number>,
    errors: Array<{ phase: string; message: string }>,
  ): Promise<Record<string, unknown>> {
    const rows = await this.prismaPublic.reconciliationLog.findMany({
      where: { runId },
      select: { severity: true, type: true },
    });
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const r of rows) {
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }
    const totalIssues = rows.length;
    const duration_ms = finishedAt.getTime() - startedAt.getTime();
    const critical = bySeverity['critical'] ?? 0;
    const warning = bySeverity['warning'] ?? 0;
    const info = bySeverity['info'] ?? 0;
    return {
      totalIssues,
      total_checks: totalChecks,
      totalChecks,
      critical,
      warning,
      info,
      bySeverity,
      by_severity: { ...bySeverity },
      by_type: { ...byType },
      byType: { ...byType },
      duration_ms,
      durationMs: duration_ms,
      phase_duration_ms: { ...phaseDurationMs },
      phaseDurationMs: { ...phaseDurationMs },
      ...(errors.length ? { errors, phase_errors: errors } : {}),
    };
  }

  private async appendLog(
    runId: string,
    tenantId: string,
    type: ReconciliationLogType,
    severity: ReconciliationSeverity,
    message: string,
    entityId: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const merged: Record<string, unknown> = {
      ...(metadata ?? {}),
      entity_type: type,
    };
    await this.prismaPublic.reconciliationLog.create({
      data: {
        runId,
        tenantId,
        type,
        severity,
        message,
        entityId,
        metadata: merged as Prisma.InputJsonValue,
      },
    });
  }

  private async checkTransfers(
    schemaName: string,
    runId: string,
    tenantId: string,
    onlyTransferId?: string,
    allowedBranchIds?: string[],
  ): Promise<number> {
    const branchFilterList =
      allowedBranchIds && allowedBranchIds.length > 0
        ? ' AND (st.from_branch_id = ANY($1::uuid[]) OR st.to_branch_id = ANY($1::uuid[]))'
        : '';
    const branchFilterSingle =
      allowedBranchIds && allowedBranchIds.length > 0
        ? ' AND (st.from_branch_id = ANY($2::uuid[]) OR st.to_branch_id = ANY($2::uuid[]))'
        : '';

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      let sql: string;
      const params: unknown[] = [];
      if (onlyTransferId) {
        sql = `SELECT
          st.id,
          st.transfer_number::text AS transfer_number,
          st.from_branch_id::text AS from_branch_id,
          st.to_branch_id::text AS to_branch_id,
          st.status,
          st.approval_state,
          st.is_reversed,
          st.shipped_journal_entry_id,
          st.receive_journal_entry_id,
          st.ship_reversal_journal_entry_id,
          st.receive_reversal_journal_entry_id
        FROM stock_transfers st
        WHERE st.status IN ('shipped', 'received')
          AND st.id = $1::uuid${branchFilterSingle}`;
        params.push(onlyTransferId);
        if (allowedBranchIds?.length) params.push(allowedBranchIds);
      } else {
        sql = `SELECT
          st.id,
          st.transfer_number::text AS transfer_number,
          st.from_branch_id::text AS from_branch_id,
          st.to_branch_id::text AS to_branch_id,
          st.status,
          st.approval_state,
          st.is_reversed,
          st.shipped_journal_entry_id,
          st.receive_journal_entry_id,
          st.ship_reversal_journal_entry_id,
          st.receive_reversal_journal_entry_id
        FROM stock_transfers st
        WHERE st.status IN ('shipped', 'received')${branchFilterList}`;
        if (allowedBranchIds?.length) params.push(allowedBranchIds);
      }

      const transfers = await tx.$queryRawUnsafe<TransferCheckRow[]>(
        sql,
        ...params,
      );

      const transferCode = (t: TransferCheckRow) =>
        formatTransferEntityCode(t.transfer_number) ?? `TR:${t.id.slice(0, 8)}`;

      for (const transfer of transfers) {
        const ec = transferCode(transfer);
        const branchMeta = {
          from_branch_id: transfer.from_branch_id,
          to_branch_id: transfer.to_branch_id,
        };
        if (
          transfer.status === 'shipped' &&
          !transfer.shipped_journal_entry_id
        ) {
          await this.appendLog(
            runId,
            tenantId,
            'transfer',
            severityTransferMissingJournal(),
            'Shipped transfer missing shipped journal entry id',
            transfer.id,
            { status: transfer.status, entity_code: ec, ...branchMeta },
          );
        }
        if (transfer.status === 'received') {
          if (!transfer.shipped_journal_entry_id) {
            await this.appendLog(
              runId,
              tenantId,
              'transfer',
              severityTransferMissingJournal(),
              'Received transfer missing shipped journal entry id',
              transfer.id,
              { status: transfer.status, entity_code: ec, ...branchMeta },
            );
          }
          if (!transfer.receive_journal_entry_id) {
            await this.appendLog(
              runId,
              tenantId,
              'transfer',
              severityTransferMissingJournal(),
              'Received transfer missing receive journal entry id',
              transfer.id,
              { status: transfer.status, entity_code: ec, ...branchMeta },
            );
          }
        }

        const assertJe = async (jid: string | null, label: string) => {
          if (!jid) return;
          try {
            await this.journals.assertJournalIntegrity(tx, jid);
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : 'Journal integrity failure';
            const jeMeta = await tx.$queryRawUnsafe<
              {
                source_type: string | null;
                entry_date: string | null;
                branch_id: string | null;
              }[]
            >(
              `SELECT source_type::text AS source_type,
                      entry_date::text AS entry_date,
                      branch_id::text AS branch_id
               FROM journal_entries WHERE id = $1::uuid`,
              jid,
            );
            const j0 = jeMeta[0];
            const jCode = j0
              ? formatJournalEntityCode(j0.source_type, j0.entry_date)
              : `JE:${jid.slice(0, 8)}`;
            await this.appendLog(
              runId,
              tenantId,
              'journal',
              severityJournalIntegrityFailure(),
              `${label}: ${msg}`,
              jid,
              {
                transfer_id: transfer.id,
                entity_code: jCode,
                branch_id: j0?.branch_id ?? undefined,
                ...branchMeta,
              },
            );
          }
        };

        await assertJe(transfer.shipped_journal_entry_id, 'Ship journal');
        await assertJe(transfer.receive_journal_entry_id, 'Receive journal');
        await assertJe(
          transfer.ship_reversal_journal_entry_id,
          'Ship reversal journal',
        );
        await assertJe(
          transfer.receive_reversal_journal_entry_id,
          'Receive reversal journal',
        );

        if (
          transfer.status === 'received' &&
          transfer.shipped_journal_entry_id &&
          transfer.receive_journal_entry_id
        ) {
          try {
            await this.assertCrossBranchSingleTransfer(
              tx,
              transfer.shipped_journal_entry_id,
              transfer.receive_journal_entry_id,
            );
          } catch (e) {
            await this.appendLog(
              runId,
              tenantId,
              'branch',
              severityBranchCrossMismatch(),
              e instanceof Error ? e.message : 'Cross-branch mismatch',
              transfer.id,
              {
                shipped_journal_entry_id: transfer.shipped_journal_entry_id,
                receive_journal_entry_id: transfer.receive_journal_entry_id,
                entity_code: ec,
                ...branchMeta,
              },
            );
          }
        }
      }
      return transfers.length;
    });
  }

  private async assertCrossBranchSingleTransfer(
    tx: Parameters<JournalService['assertJournalIntegrity']>[0],
    shipJournalId: string,
    receiveJournalId: string,
  ): Promise<void> {
    const ship = await this.readJournalTotals(tx, shipJournalId);
    const receive = await this.readJournalTotals(tx, receiveJournalId);
    if (Math.abs(ship.debit - receive.credit) > EPS_CROSS) {
      throw new Error(
        `Cross-branch amount mismatch: ship debits ${ship.debit} vs receive credits ${receive.credit}`,
      );
    }
  }

  private async readJournalTotals(
    tx: Parameters<JournalService['assertJournalIntegrity']>[0],
    journalId: string,
  ): Promise<{ debit: number; credit: number }> {
    const [totals] = await tx.$queryRawUnsafe<
      { debit_total: number; credit_total: number }[]
    >(
      `SELECT
         COALESCE(SUM(debit), 0)::numeric AS debit_total,
         COALESCE(SUM(credit), 0)::numeric AS credit_total
       FROM journal_lines
       WHERE journal_entry_id = $1::uuid`,
      journalId,
    );
    return {
      debit: Number(totals?.debit_total ?? 0),
      credit: Number(totals?.credit_total ?? 0),
    };
  }

  private async checkJournals(
    schemaName: string,
    runId: string,
    tenantId: string,
    allowedBranchIds?: string[],
  ): Promise<number> {
    const scanParams =
      allowedBranchIds && allowedBranchIds.length > 0 ? [allowedBranchIds] : [];
    const badParams =
      allowedBranchIds && allowedBranchIds.length > 0
        ? [EPS_JOURNAL, allowedBranchIds]
        : [EPS_JOURNAL];

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [scanned] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        allowedBranchIds?.length
          ? `SELECT COUNT(DISTINCT je.id)::bigint AS c
         FROM journal_entries je
         INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
         WHERE je.branch_id = ANY($1::uuid[])`
          : `SELECT COUNT(DISTINCT je.id)::bigint AS c
         FROM journal_entries je
         INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id`,
        ...scanParams,
      );
      const scannedCount = Number(scanned?.c ?? 0);

      const bad = await tx.$queryRawUnsafe<
        {
          id: string;
          entry_date: string | null;
          source_type: string | null;
          debit: string;
          credit: string;
        }[]
      >(
        allowedBranchIds?.length
          ? `SELECT je.id,
                je.entry_date::text AS entry_date,
                je.source_type::text AS source_type,
                COALESCE(SUM(jl.debit), 0)::text AS debit,
                COALESCE(SUM(jl.credit), 0)::text AS credit
         FROM journal_entries je
         INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
         WHERE je.branch_id = ANY($2::uuid[])
         GROUP BY je.id, je.entry_date, je.source_type
         HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > $1::numeric`
          : `SELECT je.id,
                je.entry_date::text AS entry_date,
                je.source_type::text AS source_type,
                COALESCE(SUM(jl.debit), 0)::text AS debit,
                COALESCE(SUM(jl.credit), 0)::text AS credit
         FROM journal_entries je
         INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
         GROUP BY je.id, je.entry_date, je.source_type
         HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > $1::numeric`,
        ...badParams,
      );
      for (const row of bad) {
        const d = Number(row.debit);
        const c = Number(row.credit);
        const [br] = await tx.$queryRawUnsafe<{ bid: string | null }[]>(
          `SELECT branch_id::text AS bid FROM journal_entries WHERE id = $1::uuid`,
          row.id,
        );
        await this.appendLog(
          runId,
          tenantId,
          'journal',
          severityJournalUnbalanced(),
          `Journal not balanced: debits ${d} vs credits ${c}`,
          row.id,
          {
            debit: d,
            credit: c,
            branch_id: br?.bid ?? undefined,
            entity_code: formatJournalEntityCode(
              row.source_type,
              row.entry_date,
            ),
          },
        );
      }

      const orphanRows = await tx.$queryRawUnsafe<
        {
          id: string;
          entry_date: string | null;
          source_type: string | null;
        }[]
      >(
        allowedBranchIds?.length
          ? `SELECT je.id,
                je.entry_date::text AS entry_date,
                je.source_type::text AS source_type
         FROM journal_entries je
         LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
         WHERE je.branch_id = ANY($1::uuid[])
         GROUP BY je.id, je.entry_date, je.source_type
         HAVING COUNT(jl.id) = 0`
          : `SELECT je.id,
                je.entry_date::text AS entry_date,
                je.source_type::text AS source_type
         FROM journal_entries je
         LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
         GROUP BY je.id, je.entry_date, je.source_type
         HAVING COUNT(jl.id) = 0`,
        ...scanParams,
      );
      for (const row of orphanRows) {
        const [br] = await tx.$queryRawUnsafe<{ bid: string | null }[]>(
          `SELECT branch_id::text AS bid FROM journal_entries WHERE id = $1::uuid`,
          row.id,
        );
        await this.appendLog(
          runId,
          tenantId,
          'journal',
          severityJournalIntegrityFailure(),
          'Journal entry has no lines',
          row.id,
          {
            branch_id: br?.bid ?? undefined,
            entity_code: formatJournalEntityCode(
              row.source_type,
              row.entry_date,
            ),
          },
        );
      }

      return scannedCount;
    });
  }

  /**
   * Per-transfer pairing of due_from (source branch) vs due_to (destination).
   * Consolidated balance sheet residual uses the same gross balances as
   * `interbranchBalanceSheetResidual` in `src/accounting/consolidation-report.util.ts`.
   */
  private async checkCrossBranchPairs(
    schemaName: string,
    runId: string,
    tenantId: string,
    allowedBranchIds?: string[],
  ): Promise<number> {
    const pairScope =
      allowedBranchIds && allowedBranchIds.length > 0
        ? ' AND (st.from_branch_id = ANY($1::uuid[]) OR st.to_branch_id = ANY($1::uuid[]))'
        : '';
    const pairScopeRows =
      allowedBranchIds && allowedBranchIds.length > 0
        ? ' AND (st.from_branch_id = ANY($2::uuid[]) OR st.to_branch_id = ANY($2::uuid[]))'
        : '';

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const countParams =
        allowedBranchIds?.length && allowedBranchIds.length > 0
          ? [allowedBranchIds]
          : [];
      const [pairCountRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        allowedBranchIds?.length
          ? `SELECT COUNT(*)::bigint AS c FROM (
           SELECT st.from_branch_id, st.to_branch_id
           FROM stock_transfers st
           INNER JOIN journal_entries je
             ON je.source_id = st.id
            AND je.source_type IN (
              'transfer_ship',
              'transfer_ship_reversal',
              'transfer_receive',
              'transfer_receive_reversal'
            )
           INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
           INNER JOIN chart_of_accounts coa
             ON coa.id = jl.account_id
            AND coa.branch_id = je.branch_id
           WHERE st.receive_journal_entry_id IS NOT NULL
           ${pairScope}
           GROUP BY st.from_branch_id, st.to_branch_id
         ) pair_groups`
          : `SELECT COUNT(*)::bigint AS c FROM (
           SELECT st.from_branch_id, st.to_branch_id
           FROM stock_transfers st
           INNER JOIN journal_entries je
             ON je.source_id = st.id
            AND je.source_type IN (
              'transfer_ship',
              'transfer_ship_reversal',
              'transfer_receive',
              'transfer_receive_reversal'
            )
           INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
           INNER JOIN chart_of_accounts coa
             ON coa.id = jl.account_id
            AND coa.branch_id = je.branch_id
           WHERE st.receive_journal_entry_id IS NOT NULL
           GROUP BY st.from_branch_id, st.to_branch_id
         ) pair_groups`,
        ...countParams,
      );
      const pairsEvaluated = Number(pairCountRow?.c ?? 0);

      const rowsParams = allowedBranchIds?.length
        ? [EPS_CROSS, allowedBranchIds]
        : [EPS_CROSS];
      const rows = await tx.$queryRawUnsafe<
        {
          from_branch_id: string;
          to_branch_id: string;
          total_from: string;
          total_to: string;
        }[]
      >(
        allowedBranchIds?.length
          ? `SELECT * FROM (
           SELECT
             st.from_branch_id,
             st.to_branch_id,
             COALESCE(SUM(
               CASE
                 WHEN je.branch_id = st.from_branch_id
                      AND coa.account_key = 'due_from_branch'
                 THEN jl.debit - jl.credit
                 ELSE 0
               END
             ), 0)::numeric(14,4) AS total_from,
             COALESCE(SUM(
               CASE
                 WHEN je.branch_id = st.to_branch_id
                      AND coa.account_key = 'due_to_branch'
                 THEN jl.credit - jl.debit
                 ELSE 0
               END
             ), 0)::numeric(14,4) AS total_to
           FROM stock_transfers st
           INNER JOIN journal_entries je
             ON je.source_id = st.id
            AND je.source_type IN (
              'transfer_ship',
              'transfer_ship_reversal',
              'transfer_receive',
              'transfer_receive_reversal'
            )
           INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
           INNER JOIN chart_of_accounts coa
             ON coa.id = jl.account_id
            AND coa.branch_id = je.branch_id
           WHERE st.receive_journal_entry_id IS NOT NULL
           ${pairScopeRows}
           GROUP BY st.from_branch_id, st.to_branch_id
         ) pair_totals
         WHERE ABS(pair_totals.total_from - pair_totals.total_to) > $1::numeric`
          : `SELECT * FROM (
           SELECT
             st.from_branch_id,
             st.to_branch_id,
             COALESCE(SUM(
               CASE
                 WHEN je.branch_id = st.from_branch_id
                      AND coa.account_key = 'due_from_branch'
                 THEN jl.debit - jl.credit
                 ELSE 0
               END
             ), 0)::numeric(14,4) AS total_from,
             COALESCE(SUM(
               CASE
                 WHEN je.branch_id = st.to_branch_id
                      AND coa.account_key = 'due_to_branch'
                 THEN jl.credit - jl.debit
                 ELSE 0
               END
             ), 0)::numeric(14,4) AS total_to
           FROM stock_transfers st
           INNER JOIN journal_entries je
             ON je.source_id = st.id
            AND je.source_type IN (
              'transfer_ship',
              'transfer_ship_reversal',
              'transfer_receive',
              'transfer_receive_reversal'
            )
           INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
           INNER JOIN chart_of_accounts coa
             ON coa.id = jl.account_id
            AND coa.branch_id = je.branch_id
           WHERE st.receive_journal_entry_id IS NOT NULL
           GROUP BY st.from_branch_id, st.to_branch_id
         ) pair_totals
         WHERE ABS(pair_totals.total_from - pair_totals.total_to) > $1::numeric`,
        ...rowsParams,
      );

      const branchIds = new Set<string>();
      for (const row of rows) {
        branchIds.add(row.from_branch_id);
        branchIds.add(row.to_branch_id);
      }
      const branchMap = new Map<string, string>();
      if (branchIds.size > 0) {
        const ids = [...branchIds];
        const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
        const bRows = await tx.$queryRawUnsafe<
          { id: string; name: string | null }[]
        >(
          `SELECT id::text AS id, name FROM branches WHERE id IN (${ph})`,
          ...ids,
        );
        for (const b of bRows ?? []) {
          branchMap.set(b.id, (b.name ?? '').trim() || b.id);
        }
      }

      for (const row of rows) {
        const fn = branchMap.get(row.from_branch_id) ?? 'Unknown';
        const tn = branchMap.get(row.to_branch_id) ?? 'Unknown';
        await this.appendLog(
          runId,
          tenantId,
          'branch',
          severityBranchCrossMismatch(),
          `Cross-branch DueFrom vs DueTo mismatch for branch pair`,
          null,
          {
            from_branch_id: row.from_branch_id,
            to_branch_id: row.to_branch_id,
            total_due_from: row.total_from,
            total_due_to: row.total_to,
            entity_code: formatBranchPairEntityCode(fn, tn),
          },
        );
      }
      return pairsEvaluated;
    });
  }

  /**
   * Compares batch-based stock valuation to the inventory GL account.
   *
   * **Legacy transfers (before FIFO ship + inbound xfer batches):** stock may have moved
   * without matching `batches` rows, causing persistent mismatch here. One-off options:
   * (1) Identify `stock_transfers` in shipped/received state and insert destination batches
   *     with `batch_number` like `xfer:<transfer_id>:<product_id>`, `cost_price` =
   *     `unit_cost_snapshot`, and selling from purchases / `products.list_price`;
   *     optionally reduce source `batches` to match consumed quantities if still overstated.
   * (2) Post a manual GL inventory adjustment and document the transfer ids.
   * After corrective data, re-run tenant reconciliation and confirm this check clears.
   */
  private async checkInventoryVsGl(
    schemaName: string,
    runId: string,
    tenantId: string,
    allowedBranchIds?: string[],
  ): Promise<number> {
    let branchIds = await this.prisma.withTenantSchema(schemaName, async (tx) =>
      tx.$queryRawUnsafe<{ id: string; name: string | null }[]>(
        `SELECT id, name FROM branches ORDER BY name`,
      ),
    );
    if (allowedBranchIds?.length) {
      const allow = new Set(allowedBranchIds);
      branchIds = branchIds.filter((b) => allow.has(b.id));
    }

    const asOf = '2099-12-31';

    for (const b of branchIds) {
      const branchId = b.id;
      const branchLabel = (b.name ?? '').trim() || 'unknown';
      const valuation = await this.financialReports.inventoryValuation(
        schemaName,
        [branchId],
      );
      const stockValue = valuation.totalValue;

      const glRows = await this.prisma.withTenantSchema(
        schemaName,
        async (tx) =>
          tx.$queryRawUnsafe<{ net: string }[]>(
            `SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric(14,4)::text AS net
             FROM journal_lines jl
             INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
             INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
             WHERE je.branch_id = $1::uuid
               AND je.entry_date <= $2::date
               AND coa.account_key = 'inventory'`,
            branchId,
            asOf,
          ),
      );
      const glValue = Number(glRows[0]?.net ?? 0);
      const diff = Math.abs(stockValue - glValue);

      if (diff <= EPS_INV_WARN) continue;

      await this.appendLog(
        runId,
        tenantId,
        'inventory',
        severityInventoryGlMismatch(),
        `Inventory stock valuation vs GL inventory account mismatch`,
        branchId,
        {
          branch_id: branchId,
          stock_valuation: stockValue,
          gl_inventory_net: glValue,
          diff,
          large_gap: diff >= EPS_INV_CRITICAL,
          entity_code: formatBranchInventoryEntityCode(branchLabel),
        },
      );
    }
    return branchIds.length;
  }

  private async checkEventReplay(
    schemaName: string,
    runId: string,
    tenantId: string,
    onlyTransferId?: string,
    allowedBranchIds?: string[],
  ): Promise<number> {
    const branchFilterList =
      allowedBranchIds && allowedBranchIds.length > 0
        ? ' AND (st.from_branch_id = ANY($1::uuid[]) OR st.to_branch_id = ANY($1::uuid[]))'
        : '';
    const branchFilterSingle =
      allowedBranchIds && allowedBranchIds.length > 0
        ? ' AND (st.from_branch_id = ANY($2::uuid[]) OR st.to_branch_id = ANY($2::uuid[]))'
        : '';

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      let sql: string;
      const params: unknown[] = [];
      if (onlyTransferId) {
        sql = `SELECT
          st.id,
          st.transfer_number::text AS transfer_number,
          st.from_branch_id::text AS from_branch_id,
          st.to_branch_id::text AS to_branch_id,
          st.status,
          st.approval_state,
          st.is_reversed,
          st.shipped_journal_entry_id,
          st.receive_journal_entry_id,
          st.ship_reversal_journal_entry_id,
          st.receive_reversal_journal_entry_id
        FROM stock_transfers st
        WHERE st.status IN ('shipped', 'received')
          AND st.id = $1::uuid${branchFilterSingle}`;
        params.push(onlyTransferId);
        if (allowedBranchIds?.length) params.push(allowedBranchIds);
      } else {
        sql = `SELECT
          st.id,
          st.transfer_number::text AS transfer_number,
          st.from_branch_id::text AS from_branch_id,
          st.to_branch_id::text AS to_branch_id,
          st.status,
          st.approval_state,
          st.is_reversed,
          st.shipped_journal_entry_id,
          st.receive_journal_entry_id,
          st.ship_reversal_journal_entry_id,
          st.receive_reversal_journal_entry_id
        FROM stock_transfers st
        WHERE st.status IN ('shipped', 'received')${branchFilterList}`;
        if (allowedBranchIds?.length) params.push(allowedBranchIds);
      }

      const transfers = await tx.$queryRawUnsafe<TransferCheckRow[]>(
        sql,
        ...params,
      );

      for (const transfer of transfers) {
        const events = await tx.$queryRawUnsafe<
          {
            event_type: string;
            metadata: Record<string, unknown> | null;
          }[]
        >(
          `SELECT event_type, metadata
           FROM stock_transfer_events
           WHERE transfer_id = $1::uuid
           ORDER BY aggregate_version ASC, created_at ASC`,
          transfer.id,
        );
        const derived = deriveStateFromEvents(
          events.map((e) => ({
            type: e.event_type,
            metadata:
              e.metadata && typeof e.metadata === 'object' ? e.metadata : null,
          })),
        );
        const mismatches = compareDerivedToDb(derived, {
          status: transfer.status as
            | 'draft'
            | 'confirmed'
            | 'shipped'
            | 'received',
          approval_state: transfer.approval_state as
            | 'none'
            | 'pending'
            | 'approved'
            | 'rejected',
          is_reversed: transfer.is_reversed,
          shipped_journal_entry_id: transfer.shipped_journal_entry_id,
          receive_journal_entry_id: transfer.receive_journal_entry_id,
          ship_reversal_journal_entry_id:
            transfer.ship_reversal_journal_entry_id,
          receive_reversal_journal_entry_id:
            transfer.receive_reversal_journal_entry_id,
        });
        if (mismatches.length > 0) {
          const ec =
            formatTransferEntityCode(transfer.transfer_number) ??
            `TR:${transfer.id.slice(0, 8)}`;
          const human = describeReplayMismatchesForLog(derived, {
            status: transfer.status as
              | 'draft'
              | 'confirmed'
              | 'shipped'
              | 'received',
            approval_state: transfer.approval_state as
              | 'none'
              | 'pending'
              | 'approved'
              | 'rejected',
            is_reversed: transfer.is_reversed,
            shipped_journal_entry_id: transfer.shipped_journal_entry_id,
            receive_journal_entry_id: transfer.receive_journal_entry_id,
            ship_reversal_journal_entry_id:
              transfer.ship_reversal_journal_entry_id,
            receive_reversal_journal_entry_id:
              transfer.receive_reversal_journal_entry_id,
          });
          const summary =
            human.length > 0
              ? `Event replay does not match this transfer: ${human.join(' ')}`
              : `Event replay mismatch (${mismatches.length} field(s)); see metadata for technical detail.`;
          await this.appendLog(
            runId,
            tenantId,
            'event',
            severityEventReplayMismatch(),
            summary,
            transfer.id,
            {
              mismatches,
              mismatch_detail: human,
              entity_code: ec,
              from_branch_id: transfer.from_branch_id,
              to_branch_id: transfer.to_branch_id,
            },
          );
        }
      }
      return transfers.length;
    });
  }
}
