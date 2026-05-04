import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import archiver from 'archiver';
import type { Request, Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  branchColumnPredicate,
  resolveReportBranchScope,
  type ReportScopeMeta,
} from '../common/branch-scope';
import { TenantContextService } from '../tenant/tenant-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingLockDateService } from './accounting-lock-date.service';
import { AuditLogService } from './audit-log.service';
import { ConsolidationEngineService } from './consolidation-engine.service';
import { EntityHierarchyService } from './entity-hierarchy.service';
import { CreateReportExportJobDto } from './dto/create-report-export-job.dto';
import { CreateConsolidationRunDto } from './dto/create-consolidation-run.dto';
import { ReverseConsolidationRunDto } from './dto/reverse-consolidation-run.dto';
import {
  FinancialReportsService,
  type ReportStatus,
} from './financial-reports.service';
import { ReportExportJobsService } from './report-export-jobs.service';
import { computeVariance } from './report-variance.util';
import {
  buildBalanceSheetSnapshotComparison,
  buildBalanceSheetSnapshotVariance,
  buildCashFlowSnapshotComparison,
  buildCashFlowSnapshotVariance,
  buildPnlSnapshotComparison,
  buildPnlSnapshotVariance,
} from './report-snapshot-comparison.util';
import { computeProfitLossKpis } from './report-kpi.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';

@Controller('reports')
export class FinancialReportsController {
  private readonly logger = new Logger(FinancialReportsController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    private readonly lockDates: AccountingLockDateService,
    private readonly reports: FinancialReportsService,
    private readonly consolidationEngine: ConsolidationEngineService,
    private readonly entityHierarchy: EntityHierarchyService,
    private readonly audit: AuditLogService,
    private readonly exportJobs: ReportExportJobsService,
    private readonly notifications: NotificationsService,
  ) {}

  private static readonly EPSILON = 0.01;
  private static readonly criticalAlertDedupe = new Map<string, number>();
  private static readonly controlAlertDedupe = new Map<string, number>();

  private parseBool(v?: string): boolean {
    if (!v) return false;
    const x = v.trim().toLowerCase();
    return x === '1' || x === 'true' || x === 'yes' || x === 'on';
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Tenant in-app notification when report validation is CRITICAL (deduped). */
  private notifyCriticalReportIfNeeded(
    schema: string,
    reportType: string,
    periodKey: string,
    reportStatus: ReportStatus,
    title: string,
    detail: string,
  ): void {
    if (reportStatus !== 'CRITICAL') return;
    const key = `${schema}|${reportType}|${periodKey}`;
    const now = Date.now();
    const ttl =
      Number(process.env.REPORT_CRITICAL_ALERT_DEDUPE_MS) || 2 * 3600 * 1000;
    const last = FinancialReportsController.criticalAlertDedupe.get(key) ?? 0;
    if (now - last < ttl) return;
    FinancialReportsController.criticalAlertDedupe.set(key, now);
    void this.notifications
      .create(schema, {
        type: 'critical',
        title,
        message: detail.slice(0, 1500),
      })
      .catch((err) =>
        this.logger.warn(
          `CRITICAL report notification failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  private notifyControlAlertIfNeeded(
    schema: string,
    code: string,
    title: string,
    message: string,
  ) {
    const key = `${schema}|${code}`;
    const now = Date.now();
    const ttl = Number(process.env.CONTROL_ALERT_DEDUPE_MS) || 60 * 60 * 1000;
    const last = FinancialReportsController.controlAlertDedupe.get(key) ?? 0;
    if (now - last < ttl) return;
    FinancialReportsController.controlAlertDedupe.set(key, now);
    void this.notifications
      .create(schema, {
        type: 'warning',
        title,
        message: message.slice(0, 1500),
      })
      .catch(() => undefined);
  }

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  /**
   * Resolves branch scope for reports: single `branchId`, CSV `branchIds`,
   * or `aggregateAll` over the entire allowed read scope from middleware.
   */
  private reportBranchScope(
    req: Request,
    branchId?: string,
    branchIds?: string,
    aggregateAll?: string,
  ): ReportScopeMeta {
    const agg =
      aggregateAll === 'true' || aggregateAll === '1' || aggregateAll === 'yes';
    if (agg) {
      return resolveReportBranchScope(req, { aggregateAll: true });
    }
    return resolveReportBranchScope(req, { branchId, branchIds });
  }

  private withScopeMeta<T>(payload: T, scope: ReportScopeMeta): T {
    if (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      !('scopeMeta' in (payload as Record<string, unknown>))
    ) {
      return {
        ...(payload as Record<string, unknown>),
        scopeMeta: scope,
      } as T;
    }
    return payload;
  }

  private static asRecord(v: unknown): Record<string, unknown> | null {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  }

  private branchMatchesWarning(
    metadata: unknown,
    allowedBranchIds: string[],
  ): boolean {
    if (!allowedBranchIds.length) return true;
    const set = new Set(allowedBranchIds);
    const meta = FinancialReportsController.asRecord(metadata);
    if (!meta) return true;
    const branchKeys = ['branch_id', 'from_branch_id', 'to_branch_id'] as const;
    for (const key of branchKeys) {
      const raw = meta[key];
      if (typeof raw === 'string' && raw.trim() && set.has(raw.trim())) {
        return true;
      }
    }
    return false;
  }

  private resolveReportStatus(
    warnings: Array<{ severity: 'critical' | 'warning' | 'info' }>,
  ): ReportStatus {
    if (warnings.some((w) => w.severity === 'critical')) return 'CRITICAL';
    if (warnings.length > 0) return 'WARNING';
    return 'CLEAN';
  }

  private async reportValidation(
    req: Request,
    schemaName: string,
    branchIds: string[],
    dateScope: { fromDate?: string; toDate?: string; asOfDate?: string },
    baseWarnings: Array<{
      severity: 'critical' | 'warning' | 'info';
      code: string;
      message: string;
    }> = [],
  ) {
    const tenant = this.tenantContext.getTenant()!;
    const allowedBranchIds = req.allowedBranchIds ?? [];
    const warnings = [...baseWarnings];
    const latest = await this.prisma.reconciliationRun.findFirst({
      where: { tenantId: tenant.id, status: 'completed' },
      orderBy: { finishedAt: 'desc' },
      select: { id: true, startedAt: true, finishedAt: true },
    });

    if (!latest) {
      warnings.push({
        severity: 'warning',
        code: 'reconciliation_missing',
        message:
          'No completed reconciliation run is available yet for this tenant.',
      });
    } else {
      const logs = await this.prisma.reconciliationLog.findMany({
        where: {
          tenantId: tenant.id,
          runId: latest.id,
          severity: { in: ['critical', 'warning'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          severity: true,
          message: true,
          metadata: true,
        },
      });
      for (const row of logs) {
        if (!this.branchMatchesWarning(row.metadata, allowedBranchIds))
          continue;
        warnings.push({
          severity: row.severity as 'critical' | 'warning',
          code: 'reconciliation_log',
          message: row.message,
        });
      }
    }

    const guardWarnings = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) => {
        const { sql: branchWhere, branchParams } = branchColumnPredicate(
          'je.branch_id',
          branchIds,
          1,
        );
        const whereDate = dateScope.asOfDate
          ? `AND je.entry_date <= $2::date`
          : `AND je.entry_date >= $2::date AND je.entry_date <= $3::date`;
        const dateParams = dateScope.asOfDate
          ? [dateScope.asOfDate]
          : [
              dateScope.fromDate ?? '1970-01-01',
              dateScope.toDate ?? '2099-12-31',
            ];
        const [journalCheck] = await tx.$queryRawUnsafe<
          { debits: string; credits: string }[]
        >(
          `SELECT COALESCE(SUM(jl.debit), 0)::numeric(14,2)::text AS debits,
                  COALESCE(SUM(jl.credit), 0)::numeric(14,2)::text AS credits
           FROM journal_lines jl
           INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
           WHERE ${branchWhere}
             ${whereDate}`,
          ...branchParams,
          ...dateParams,
        );
        const debits = Number(journalCheck?.debits ?? 0);
        const credits = Number(journalCheck?.credits ?? 0);
        const delta = Math.abs(debits - credits);
        const scopedWarnings: Array<{
          severity: 'critical' | 'warning' | 'info';
          code: string;
          message: string;
        }> = [];
        if (delta > FinancialReportsController.EPSILON) {
          scopedWarnings.push({
            severity: 'critical',
            code: 'journal_scope_unbalanced',
            message:
              'Journal lines are not balanced for the selected report scope and period.',
          });
        }
        const [missingType] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT COUNT(*)::bigint AS c
           FROM chart_of_accounts coa
           WHERE coa.account_type IS NULL OR TRIM(coa.account_type) = ''`,
        );
        if (Number(missingType?.c ?? 0) > 0) {
          scopedWarnings.push({
            severity: 'warning',
            code: 'coa_missing_account_type',
            message:
              'Some chart of accounts rows are missing account_type; report grouping may be incomplete.',
          });
        }
        return scopedWarnings;
      },
    );
    warnings.push(...guardWarnings);

    const reportStatus = this.resolveReportStatus(warnings);
    return {
      warnings,
      isValid: reportStatus !== 'CRITICAL',
      reportStatus,
      validation: {
        checkedAt: new Date().toISOString(),
        latestReconciliationRunId: latest?.id ?? null,
      },
    };
  }

  private withValidationEnvelope<T extends Record<string, unknown>>(
    payload: T,
    validation: {
      warnings: Array<{
        severity: 'critical' | 'warning' | 'info';
        code: string;
        message: string;
      }>;
      isValid: boolean;
      reportStatus: ReportStatus;
      validation: {
        checkedAt: string;
        latestReconciliationRunId: string | null;
      };
    },
  ) {
    return {
      ...payload,
      data: payload,
      warnings: validation.warnings,
      isValid: validation.isValid,
      reportStatus: validation.reportStatus,
      validation: validation.validation,
    };
  }

  private exportHooksPaths() {
    return { pdf: 'exports', excel: 'exports' } as const;
  }

  private async incomeStatementPayload(
    req: Request,
    from: string,
    to: string,
    branchId?: string,
    branchIds?: string,
    aggregateAll?: string,
    breakdown?: string,
    compareFrom?: string,
    compareTo?: string,
    scopeHash?: string,
    compareSnapshot?: string,
    consolidationMode?: string,
    entityId?: string,
  ) {
    this.ensureTenant();
    let scope = this.reportBranchScope(req, branchId, branchIds, aggregateAll);
    let branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const resolvedEntityScope = entityId?.trim()
      ? await this.entityHierarchy.resolveScopeByEntity(schema, entityId.trim())
      : null;
    if (resolvedEntityScope) {
      branches = resolvedEntityScope.branchIds;
      if (branches.length <= 1) {
        throw new BadRequestException(
          'Entity scope must resolve to more than one branch for consolidated reporting',
        );
      }
      scope = {
        ...scope,
        branchIds: branches,
        aggregateAll: true,
      };
    }
    const entityScopeHash =
      scopeHash?.trim() ||
      (resolvedEntityScope
        ? `scope:entity:${resolvedEntityScope.entityId}`
        : 'scope:unspecified');
    const payload = await this.reports.incomeStatement(
      schema,
      branches,
      from.trim(),
      to.trim(),
      {
        monthlyBreakdown: breakdown?.trim().toLowerCase() === 'monthly',
        drilldownPath: '/accounting/journal-lines',
      },
    );
    const usePostedConsolidation =
      (consolidationMode?.trim().toLowerCase() ?? '') === 'posted';
    let postedConsolidation: {
      runId: string;
      postedAt: string;
      metadata: Record<string, unknown> | null;
    } | null = null;
    if (usePostedConsolidation && branches.length > 1) {
      const adjustments =
        await this.consolidationEngine.queryConsolidationPnlAdjustments(
          schema,
          branches,
          from.trim(),
          to.trim(),
        );
      if (
        Math.abs(adjustments.revenue) > FinancialReportsController.EPSILON ||
        Math.abs(adjustments.cogs) > FinancialReportsController.EPSILON ||
        Math.abs(adjustments.expenses) > FinancialReportsController.EPSILON
      ) {
        payload.totalRevenue = this.round2(
          payload.totalRevenue - adjustments.revenue,
        );
        payload.cogs = this.round2(payload.cogs - adjustments.cogs);
        payload.otherExpenses = this.round2(
          payload.otherExpenses - adjustments.expenses,
        );
        payload.totalExpenses = this.round2(
          payload.cogs + payload.otherExpenses,
        );
        payload.grossProfit = this.round2(payload.totalRevenue - payload.cogs);
        payload.netIncome = this.round2(
          payload.totalRevenue - payload.totalExpenses,
        );
      }
      postedConsolidation =
        await this.consolidationEngine.getLatestPostedSummary({
          schemaName: schema,
          scopeHash: entityScopeHash,
          entityId: resolvedEntityScope?.entityId || undefined,
          periodKey: `${from.trim()}::${to.trim()}`,
        });
    }

    const pnlDiff = Math.abs(
      payload.netIncome - (payload.totalRevenue - payload.totalExpenses),
    );
    const baseWarnings =
      pnlDiff > FinancialReportsController.EPSILON
        ? [
            {
              severity: 'critical' as const,
              code: 'profit_loss_mismatch',
              message:
                'Net profit mismatch detected: revenue minus expenses does not equal net income.',
            },
          ]
        : [];
    const validation = await this.reportValidation(
      req,
      schema,
      branches,
      {
        fromDate: from.trim(),
        toDate: to.trim(),
      },
      baseWarnings,
    );
    const compare =
      compareFrom?.trim() && compareTo?.trim()
        ? await this.reports.incomeStatement(
            schema,
            branches,
            compareFrom.trim(),
            compareTo.trim(),
          )
        : null;
    const periodKey = `${from.trim()}::${to.trim()}`;
    const scopeKey = entityScopeHash;
    const compareSnapshotRequested = this.parseBool(compareSnapshot);
    const priorSnap = compareSnapshotRequested
      ? await this.reports.getPriorSnapshotBeforeToday(schema, {
          reportType: 'profit_loss',
          scopeHash: scopeKey,
          periodKey,
        })
      : null;
    const snapshotComparison = buildPnlSnapshotComparison(
      {
        totalRevenue: payload.totalRevenue,
        totalExpenses: payload.totalExpenses,
        netIncome: payload.netIncome,
      },
      priorSnap,
    );
    const periodVariance = compare
      ? {
          totalRevenue: computeVariance(
            payload.totalRevenue,
            compare.totalRevenue,
          ),
          totalExpenses: computeVariance(
            payload.totalExpenses,
            compare.totalExpenses,
          ),
          netIncome: computeVariance(payload.netIncome, compare.netIncome),
        }
      : null;
    const snapshotVariance = snapshotComparison
      ? buildPnlSnapshotVariance(
          {
            totalRevenue: payload.totalRevenue,
            totalExpenses: payload.totalExpenses,
            netIncome: payload.netIncome,
          },
          snapshotComparison.baseline,
        )
      : null;
    const finalization = await this.prisma.withTenantSchema(schema, (tx) =>
      this.lockDates.getReportFinalization(tx, branches, to.trim()),
    );
    const slowThresholdMs = 1200;
    const perfWarnings =
      (payload.elapsedMs ?? 0) > slowThresholdMs
        ? [
            {
              severity: 'warning' as const,
              code: 'report_slow',
              message: `Report generation took ${payload.elapsedMs}ms which is above ${slowThresholdMs}ms threshold.`,
            },
          ]
        : [];
    if (perfWarnings.length) {
      this.logger.warn(
        `Slow report detected: profit_loss (${payload.elapsedMs}ms, scope=${scopeHash ?? 'n/a'})`,
      );
    }
    const enrichedValidation = {
      ...validation,
      warnings: [...validation.warnings, ...perfWarnings],
    };
    enrichedValidation.reportStatus = this.resolveReportStatus(
      enrichedValidation.warnings,
    );
    enrichedValidation.isValid = enrichedValidation.reportStatus !== 'CRITICAL';

    this.notifyCriticalReportIfNeeded(
      schema,
      'profit_loss',
      periodKey,
      enrichedValidation.reportStatus,
      `Critical validation: Profit & Loss (${from.trim()}–${to.trim()})`,
      enrichedValidation.warnings.map((w) => w.message).join(' | ') ||
        'See report warnings.',
    );

    const hooks = this.exportHooksPaths();
    const preEnvelope = {
      ...payload,
      consolidationMode: usePostedConsolidation ? 'posted' : 'preview',
      postedConsolidation,
      comparison: compare
        ? {
            fromDate: compareFrom?.trim(),
            toDate: compareTo?.trim(),
            totalRevenue: compare.totalRevenue,
            totalExpenses: compare.totalExpenses,
            netIncome: compare.netIncome,
          }
        : null,
      snapshotComparison,
      variance: {
        vsPeriod: periodVariance,
        vsSnapshot: snapshotVariance,
      },
      kpis: computeProfitLossKpis(
        {
          totalRevenue: payload.totalRevenue,
          totalExpenses: payload.totalExpenses,
          netIncome: payload.netIncome,
          grossProfit: payload.grossProfit,
        },
        compare
          ? {
              totalRevenue: compare.totalRevenue,
              netIncome: compare.netIncome,
            }
          : null,
      ),
      exportHooks: {
        pdf: hooks.pdf,
        excel: hooks.excel,
      },
      finalization: {
        isFinal: finalization.isFinal,
        lockDate: finalization.lockDate,
      },
      performance: {
        elapsedMs: payload.elapsedMs ?? null,
        thresholdMs: slowThresholdMs,
        isSlow: (payload.elapsedMs ?? 0) > slowThresholdMs,
      },
    };
    const snapshot = await this.reports.persistDailySnapshot(schema, {
      reportType: 'profit_loss',
      scopeHash: scopeKey,
      periodKey,
      periodStart: from.trim(),
      periodEnd: to.trim(),
      reportStatus: enrichedValidation.reportStatus,
      isFinal: finalization.isFinal,
      lockDateUsed: finalization.lockDate,
      payload: {
        ...preEnvelope,
        warnings: enrichedValidation.warnings,
        reportStatus: enrichedValidation.reportStatus,
      },
    });
    const effectiveSnapshotComparison =
      snapshotComparison ||
      (compareSnapshotRequested
        ? {
            baselineSnapshotId: snapshot.snapshotId,
            baselineSnapshotDate: snapshot.snapshotDate,
            baselineVersion: snapshot.version,
            baseline: {
              totalRevenue: payload.totalRevenue,
              totalExpenses: payload.totalExpenses,
              netIncome: payload.netIncome,
            },
            deltas: {
              totalRevenue: 0,
              totalExpenses: 0,
              netIncome: 0,
            },
          }
        : null);
    const effectiveSnapshotVariance = effectiveSnapshotComparison
      ? buildPnlSnapshotVariance(
          {
            totalRevenue: payload.totalRevenue,
            totalExpenses: payload.totalExpenses,
            netIncome: payload.netIncome,
          },
          effectiveSnapshotComparison.baseline,
        )
      : null;
    return this.withScopeMeta(
      this.withValidationEnvelope(
        {
          ...preEnvelope,
          snapshotComparison: effectiveSnapshotComparison,
          variance: {
            ...preEnvelope.variance,
            vsSnapshot: effectiveSnapshotVariance,
          },
          snapshot: {
            id: snapshot.snapshotId,
            version: snapshot.version,
            snapshotDate: snapshot.snapshotDate,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
            snapshotDiff: snapshot.snapshotDiff ?? null,
          },
        },
        enrichedValidation,
      ),
      scope,
    );
  }

  @Get('income-statement')
  async incomeStatement(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('breakdown') breakdown?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('compareSnapshot') compareSnapshot?: string,
    @Query('consolidationMode') consolidationMode?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.incomeStatementPayload(
      req,
      from,
      to,
      branchId,
      branchIds,
      aggregateAll,
      breakdown,
      compareFrom,
      compareTo,
      scopeHash,
      compareSnapshot,
      consolidationMode,
      entityId,
    );
  }

  @Get('profit-loss')
  async profitLoss(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('breakdown') breakdown?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('compareSnapshot') compareSnapshot?: string,
    @Query('consolidationMode') consolidationMode?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.incomeStatementPayload(
      req,
      from,
      to,
      branchId,
      branchIds,
      aggregateAll,
      breakdown,
      compareFrom,
      compareTo,
      scopeHash,
      compareSnapshot,
      consolidationMode,
      entityId,
    );
  }

  @Get('pnl')
  async pnlAlias(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('breakdown') breakdown?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('compareSnapshot') compareSnapshot?: string,
    @Query('consolidationMode') consolidationMode?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.incomeStatementPayload(
      req,
      from,
      to,
      branchId,
      branchIds,
      aggregateAll,
      breakdown,
      compareFrom,
      compareTo,
      scopeHash,
      compareSnapshot,
      consolidationMode,
      entityId,
    );
  }

  @Get('balance-sheet')
  async balanceSheet(
    @Req() req: Request,
    @Query('asOf') asOf: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('entityId') entityId?: string,
    @Query('consolidated') consolidated?: string,
    @Query('consolidationMode') consolidationMode?: string,
    @Query('compareAsOf') compareAsOf?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('compareSnapshot') compareSnapshot?: string,
  ) {
    this.ensureTenant();
    let scope = this.reportBranchScope(req, branchId, branchIds, aggregateAll);
    let branches = scope.branchIds;
    const useConsolidated = this.parseBool(consolidated);
    const usePostedConsolidation =
      (consolidationMode?.trim().toLowerCase() ?? '') === 'posted';
    if (useConsolidated && branches.length <= 1) {
      throw new BadRequestException(
        'consolidated=true requires more than one branch in report scope (use aggregateAll or branchIds).',
      );
    }
    if (!asOf?.trim()) {
      throw new BadRequestException(
        'Query parameter asOf (YYYY-MM-DD) is required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const resolvedEntityScope = entityId?.trim()
      ? await this.entityHierarchy.resolveScopeByEntity(schema, entityId.trim())
      : null;
    if (resolvedEntityScope) {
      branches = resolvedEntityScope.branchIds;
      if (branches.length <= 1) {
        throw new BadRequestException(
          'Entity scope must resolve to more than one branch for consolidated reporting',
        );
      }
      scope = {
        ...scope,
        branchIds: branches,
        aggregateAll: true,
      };
    }
    const entityScopeHash =
      scopeHash?.trim() ||
      (resolvedEntityScope
        ? `scope:entity:${resolvedEntityScope.entityId}`
        : 'scope:unspecified');
    const payload = await this.reports.balanceSheet(
      schema,
      branches,
      asOf.trim(),
      {
        drilldownPath: '/accounting/journal-lines',
        consolidated: useConsolidated,
      },
    );
    const equationDelta = Math.abs(
      payload.totals.assets - payload.totals.liabilitiesAndEquity,
    );
    const baseWarnings =
      equationDelta > FinancialReportsController.EPSILON
        ? [
            {
              severity: 'critical' as const,
              code: 'balance_sheet_mismatch',
              message:
                'Balance sheet mismatch detected: assets do not equal liabilities plus equity.',
            },
          ]
        : [];
    const consolidationWarnings: Array<{
      severity: 'critical' | 'warning' | 'info';
      code: string;
      message: string;
    }> = [];
    if (payload.consolidation && payload.consolidation.severity !== 'clean') {
      const severity =
        payload.consolidation.severity === 'critical'
          ? ('critical' as const)
          : ('warning' as const);
      for (const msg of payload.consolidation.messages) {
        consolidationWarnings.push({
          severity,
          code: 'consolidation_residual',
          message: msg,
        });
      }
    }
    const validation = await this.reportValidation(
      req,
      schema,
      branches,
      { asOfDate: asOf.trim() },
      [...baseWarnings, ...consolidationWarnings],
    );
    const compare = compareAsOf?.trim()
      ? await this.reports.balanceSheet(schema, branches, compareAsOf.trim(), {
          drilldownPath: '/accounting/journal-lines',
          consolidated: useConsolidated,
        })
      : null;
    const periodKey = asOf.trim();
    const scopeKey = entityScopeHash;
    const compareSnapshotRequested = this.parseBool(compareSnapshot);
    const priorBs = compareSnapshotRequested
      ? await this.reports.getPriorSnapshotBeforeToday(schema, {
          reportType: 'balance_sheet',
          scopeHash: scopeKey,
          periodKey,
        })
      : null;
    const snapshotComparison = buildBalanceSheetSnapshotComparison(
      {
        assets: payload.totals.assets,
        liabilities: payload.totals.liabilities,
        totalEquity: payload.totals.totalEquity,
      },
      priorBs,
    );
    const periodVariance = compare
      ? {
          assets: computeVariance(payload.totals.assets, compare.totals.assets),
          liabilities: computeVariance(
            payload.totals.liabilities,
            compare.totals.liabilities,
          ),
          totalEquity: computeVariance(
            payload.totals.totalEquity,
            compare.totals.totalEquity,
          ),
        }
      : null;
    const snapshotVariance = snapshotComparison
      ? buildBalanceSheetSnapshotVariance(
          {
            assets: payload.totals.assets,
            liabilities: payload.totals.liabilities,
            totalEquity: payload.totals.totalEquity,
          },
          snapshotComparison.baseline,
        )
      : null;
    const finalization = await this.prisma.withTenantSchema(schema, (tx) =>
      this.lockDates.getReportFinalization(tx, branches, asOf.trim()),
    );
    const slowThresholdMs = 1200;
    const perfWarnings =
      (payload.elapsedMs ?? 0) > slowThresholdMs
        ? [
            {
              severity: 'warning' as const,
              code: 'report_slow',
              message: `Report generation took ${payload.elapsedMs}ms which is above ${slowThresholdMs}ms threshold.`,
            },
          ]
        : [];
    if (perfWarnings.length) {
      this.logger.warn(
        `Slow report detected: balance_sheet (${payload.elapsedMs}ms, scope=${scopeHash ?? 'n/a'})`,
      );
    }
    const enrichedValidation = {
      ...validation,
      warnings: [...validation.warnings, ...perfWarnings],
    };
    enrichedValidation.reportStatus = this.resolveReportStatus(
      enrichedValidation.warnings,
    );
    enrichedValidation.isValid = enrichedValidation.reportStatus !== 'CRITICAL';

    this.notifyCriticalReportIfNeeded(
      schema,
      'balance_sheet',
      asOf.trim(),
      enrichedValidation.reportStatus,
      `Critical validation: Balance sheet (as of ${asOf.trim()})`,
      enrichedValidation.warnings.map((w) => w.message).join(' | ') ||
        'See report warnings.',
    );

    const hooks = this.exportHooksPaths();
    const postedConsolidation =
      useConsolidated && usePostedConsolidation
        ? await this.consolidationEngine.getLatestPostedSummary({
            schemaName: schema,
            scopeHash: entityScopeHash,
            entityId: resolvedEntityScope?.entityId || undefined,
            periodKey: asOf.trim(),
          })
        : null;
    const preEnvelope = {
      ...payload,
      consolidationMode:
        useConsolidated && usePostedConsolidation ? 'posted' : 'preview',
      postedConsolidation,
      comparison: compare
        ? {
            asOf: compareAsOf?.trim(),
            totals: compare.totals,
          }
        : null,
      snapshotComparison,
      variance: {
        vsPeriod: periodVariance,
        vsSnapshot: snapshotVariance,
      },
      exportHooks: {
        pdf: hooks.pdf,
        excel: hooks.excel,
      },
      finalization: {
        isFinal: finalization.isFinal,
        lockDate: finalization.lockDate,
      },
      performance: {
        elapsedMs: payload.elapsedMs ?? null,
        thresholdMs: slowThresholdMs,
        isSlow: (payload.elapsedMs ?? 0) > slowThresholdMs,
      },
    };
    const snapshot = await this.reports.persistDailySnapshot(schema, {
      reportType: 'balance_sheet',
      scopeHash: scopeHash?.trim() || 'scope:unspecified',
      periodKey: asOf.trim(),
      asOfDate: asOf.trim(),
      reportStatus: enrichedValidation.reportStatus,
      isFinal: finalization.isFinal,
      lockDateUsed: finalization.lockDate,
      payload: {
        ...preEnvelope,
        warnings: enrichedValidation.warnings,
        reportStatus: enrichedValidation.reportStatus,
      },
    });
    const effectiveSnapshotComparison =
      snapshotComparison ||
      (compareSnapshotRequested
        ? {
            baselineSnapshotId: snapshot.snapshotId,
            baselineSnapshotDate: snapshot.snapshotDate,
            baselineVersion: snapshot.version,
            baseline: {
              assets: payload.totals.assets,
              liabilities: payload.totals.liabilities,
              totalEquity: payload.totals.totalEquity,
            },
            deltas: {
              assets: 0,
              liabilities: 0,
              totalEquity: 0,
            },
          }
        : null);
    const effectiveSnapshotVariance = effectiveSnapshotComparison
      ? buildBalanceSheetSnapshotVariance(
          {
            assets: payload.totals.assets,
            liabilities: payload.totals.liabilities,
            totalEquity: payload.totals.totalEquity,
          },
          effectiveSnapshotComparison.baseline,
        )
      : null;
    return this.withScopeMeta(
      this.withValidationEnvelope(
        {
          ...preEnvelope,
          snapshotComparison: effectiveSnapshotComparison,
          variance: {
            ...preEnvelope.variance,
            vsSnapshot: effectiveSnapshotVariance,
          },
          snapshot: {
            id: snapshot.snapshotId,
            version: snapshot.version,
            snapshotDate: snapshot.snapshotDate,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
            snapshotDiff: snapshot.snapshotDiff ?? null,
          },
        },
        enrichedValidation,
      ),
      scope,
    );
  }

  @Get('interbranch-mismatches')
  async interbranchMismatches(
    @Req() req: Request,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (branches.length <= 1) {
      throw new BadRequestException(
        'interbranch-mismatches requires more than one branch in report scope',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const items = await this.reports.listInterbranchMismatches(
      schema,
      branches,
    );
    return this.withScopeMeta({ items }, scope);
  }

  @Get('stuck-transfers')
  async stuckTransfers(
    @Req() req: Request,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('olderThanHours') olderThanHours?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (branches.length <= 1) {
      throw new BadRequestException(
        'stuck-transfers requires more than one branch in report scope',
      );
    }
    const configuredHours = Number(process.env.TRANSFER_STUCK_HOURS ?? '24');
    const parsedHours = Number(olderThanHours ?? configuredHours);
    const thresholdHours = Number.isFinite(parsedHours) ? parsedHours : 24;
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const items = await this.reports.listStuckTransfers(
      schema,
      branches,
      thresholdHours,
    );
    return this.withScopeMeta(
      {
        thresholdHours: Math.max(
          1,
          Math.min(24 * 90, Math.floor(thresholdHours || 24)),
        ),
        items,
      },
      scope,
    );
  }

  @Get('consolidation-preview')
  async consolidationPreview(
    @Req() req: Request,
    @Query('asOf') asOf: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('entityId') entityId?: string,
  ) {
    this.ensureTenant();
    let scope = this.reportBranchScope(req, branchId, branchIds, aggregateAll);
    let branches = scope.branchIds;
    if (!asOf?.trim()) {
      throw new BadRequestException(
        'Query parameter asOf (YYYY-MM-DD) is required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const resolvedEntityScope = entityId?.trim()
      ? await this.entityHierarchy.resolveScopeByEntity(schema, entityId.trim())
      : null;
    if (resolvedEntityScope) {
      branches = resolvedEntityScope.branchIds;
      scope = {
        ...scope,
        branchIds: branches,
        aggregateAll: true,
      };
    }
    if (branches.length <= 1) {
      throw new BadRequestException(
        'consolidation-preview requires more than one branch in report scope',
      );
    }
    const payload = await this.reports.consolidationPreview(
      schema,
      branches,
      asOf.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Post('consolidation/run')
  @UseGuards(PermissionGuard)
  @RequirePermissions('run_consolidation')
  async runConsolidation(
    @Req() req: Request,
    @Body() body: CreateConsolidationRunDto,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const scopeHash =
      body.scopeHash?.trim() ||
      (body.entityId?.trim()
        ? `scope:entity:${body.entityId.trim()}`
        : 'scope:unspecified');
    const out = await this.consolidationEngine.runConsolidation({
      schemaName: schema,
      periodKey: body.periodKey?.trim(),
      asOfDate: body.asOfDate?.trim(),
      fromDate: body.fromDate?.trim(),
      toDate: body.toDate?.trim(),
      scopeHash,
      branchIds: body.branchIds ?? [],
      entityId: body.entityId?.trim() || undefined,
      asOfFxDate: body.asOfFxDate?.trim(),
      groupCurrency: body.groupCurrency?.trim(),
      ratePolicy: body.ratePolicy,
      fxPolicy: body.fxPolicy,
      includeAdjustments: body.includeAdjustments,
      actorUserId: req.userId ?? null,
      dryRun: body.dryRun === true,
      asDraft: body.asDraft === true,
      replaceDraftRunId: body.replaceDraftRunId?.trim(),
    });
    return out;
  }

  @Post('consolidation/runs/:runId/reverse')
  @UseGuards(PermissionGuard)
  @RequirePermissions('reverse_consolidation')
  async reverseConsolidation(
    @Req() req: Request,
    @Param('runId') runId: string,
    @Body() body: ReverseConsolidationRunDto,
  ) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new BadRequestException('Invalid consolidation run id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const run = await this.consolidationEngine.reverseConsolidationRun({
      schemaName: schema,
      runId,
      actorUserId: req.userId ?? null,
      reason: body.reason,
    });
    return { run };
  }

  @Post('consolidation/runs/:runId/finalize')
  @UseGuards(PermissionGuard)
  @RequirePermissions('finalize_consolidation')
  async finalizeConsolidationRun(
    @Req() req: Request,
    @Param('runId') runId: string,
  ) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new BadRequestException('Invalid consolidation run id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const run = await this.consolidationEngine.finalizeConsolidationRun({
      schemaName: schema,
      runId,
      actorUserId: req.userId ?? null,
    });
    return { run };
  }

  @Get('consolidation/runs')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_consolidation_history')
  async consolidationRuns(
    @Req() req: Request,
    @Query('scopeHash') scopeHash?: string,
    @Query('entityId') entityId?: string,
    @Query('periodKey') periodKey?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const rows = await this.consolidationEngine.listRuns({
      schemaName: schema,
      scopeHash: scopeHash?.trim(),
      entityId: entityId?.trim(),
      periodKey: periodKey?.trim(),
      limit: Number(limit ?? 50),
    });
    return {
      items: rows,
      requestedBy: req.userId ?? null,
    };
  }

  @Get('entities')
  async consolidationEntities() {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const items = await this.entityHierarchy.listEntities(schema);
    return { items };
  }

  @Get('consolidation/runs/:runId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_consolidation_history')
  async consolidationRunDetail(
    @Req() _req: Request,
    @Param('runId') runId: string,
  ) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new BadRequestException('Invalid consolidation run id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.consolidationEngine.getRun({
      schemaName: schema,
      runId,
    });
  }

  @Get('disclosure/nci')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_disclosure_reports')
  async disclosureNci(
    @Query('scopeHash') scopeHash: string,
    @Query('periodKey') periodKey?: string,
  ) {
    this.ensureTenant();
    if (!scopeHash?.trim()) {
      throw new BadRequestException('scopeHash is required');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.consolidationEngine.getDisclosureNciReport({
      schemaName: schema,
      scopeHash: scopeHash.trim(),
      periodKey: periodKey?.trim(),
    });
  }

  @Get('disclosure/fx-impact')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_disclosure_reports')
  async disclosureFx(
    @Query('scopeHash') scopeHash: string,
    @Query('periodKey') periodKey?: string,
  ) {
    this.ensureTenant();
    if (!scopeHash?.trim()) {
      throw new BadRequestException('scopeHash is required');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.consolidationEngine.getDisclosureFxReport({
      schemaName: schema,
      scopeHash: scopeHash.trim(),
      periodKey: periodKey?.trim(),
    });
  }

  @Get('disclosure/consolidation-adjustments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_disclosure_reports')
  async disclosureAdjustments(
    @Query('scopeHash') scopeHash: string,
    @Query('periodKey') periodKey?: string,
  ) {
    this.ensureTenant();
    if (!scopeHash?.trim()) {
      throw new BadRequestException('scopeHash is required');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.consolidationEngine.getDisclosureAdjustmentsReport({
      schemaName: schema,
      scopeHash: scopeHash.trim(),
      periodKey: periodKey?.trim(),
    });
  }

  @Get('disclosure/intercompany-elimination')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_disclosure_reports')
  async disclosureIntercompany(
    @Query('scopeHash') scopeHash: string,
    @Query('periodKey') periodKey?: string,
  ) {
    this.ensureTenant();
    if (!scopeHash?.trim()) {
      throw new BadRequestException('scopeHash is required');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.consolidationEngine.getDisclosureIntercompanyReport({
      schemaName: schema,
      scopeHash: scopeHash.trim(),
      periodKey: periodKey?.trim(),
    });
  }

  @Get('audit-package')
  @UseGuards(PermissionGuard)
  @RequirePermissions('export_audit_package')
  async auditPackage(
    @Req() req: Request,
    @Res() res: Response,
    @Query('from') fromTs?: string,
    @Query('to') toTs?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('periodKey') periodKey?: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const scope = resolveReportBranchScope(req, {
      branchId,
      branchIds,
      aggregateAll:
        aggregateAll === 'true' ||
        aggregateAll === '1' ||
        aggregateAll === 'yes',
    });
    const verify = await this.audit.verifyChainInSchema({
      schemaName: schema,
      branchIds: scope.branchIds,
      fromTs,
      toTs,
      limit: 50000,
    });
    const runs = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          id: string;
          period_key: string;
          scope_hash: string;
          status: string;
          metadata: unknown;
          posted_at: Date;
          finalized_at: Date | null;
        }>
      >(
        `SELECT id::text, period_key, scope_hash, status, metadata, posted_at, finalized_at
         FROM consolidation_runs
         WHERE ($1::text IS NULL OR scope_hash = $1)
           AND ($2::text IS NULL OR period_key = $2)
           AND reversed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 500`,
        scopeHash?.trim() || null,
        periodKey?.trim() || null,
      ),
    );
    const auditSample = await this.audit.listChainRowsInSchema({
      schemaName: schema,
      branchIds: scope.branchIds,
      fromTs,
      toTs,
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="audit-package.zip"',
    );
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
      throw err;
    });
    archive.pipe(res);
    archive.append(JSON.stringify({ ...verify, scopeMeta: scope }, null, 2), {
      name: 'audit-verify.json',
    });
    archive.append(JSON.stringify({ items: runs }, null, 2), {
      name: 'consolidation-runs.json',
    });
    archive.append(
      JSON.stringify({ rows: auditSample.slice(0, 5000) }, null, 2),
      {
        name: 'audit-log-sample.json',
      },
    );
    await archive.finalize();
  }

  @Get('fx-rates')
  async listFxRates(
    @Query('asOf') asOf?: string,
    @Query('fromCurrency') fromCurrency?: string,
    @Query('toCurrency') toCurrency?: string,
    @Query('rateType') rateType?: string,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const rows = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          id: string;
          from_currency: string;
          to_currency: string;
          rate_type: string;
          rate: string;
          as_of_date: string;
          updated_at: Date;
        }>
      >(
        `SELECT id::text,
                from_currency,
                to_currency,
                rate_type,
                rate::text,
                as_of_date::text,
                updated_at
         FROM fx_rates
         WHERE ($1::date IS NULL OR as_of_date = $1::date)
           AND ($2::text IS NULL OR from_currency = $2)
           AND ($3::text IS NULL OR to_currency = $3)
           AND ($4::text IS NULL OR rate_type = $4)
         ORDER BY as_of_date DESC, from_currency, to_currency`,
        asOf?.trim() || null,
        fromCurrency?.trim()?.toUpperCase() || null,
        toCurrency?.trim()?.toUpperCase() || null,
        rateType?.trim()?.toLowerCase() || null,
      ),
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        fromCurrency: row.from_currency,
        toCurrency: row.to_currency,
        rateType: row.rate_type,
        rate: Number(row.rate),
        asOfDate: row.as_of_date,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  }

  @Post('fx-rates')
  async upsertFxRate(
    @Req() req: Request,
    @Body()
    body: {
      fromCurrency: string;
      toCurrency: string;
      rateType?: 'closing' | 'average' | 'historical';
      rate: number;
      asOfDate: string;
    },
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const rateType = body.rateType ?? 'closing';
    const [row] = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string; updated_at: Date; rate: string }>>(
        `INSERT INTO fx_rates (from_currency, to_currency, rate_type, rate, as_of_date, updated_at)
         VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP)
         ON CONFLICT (from_currency, to_currency, rate_type, as_of_date)
         DO UPDATE SET
           rate = EXCLUDED.rate,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id::text, updated_at, rate::text`,
        body.fromCurrency.trim().toUpperCase(),
        body.toCurrency.trim().toUpperCase(),
        rateType,
        Number(body.rate),
        body.asOfDate.trim(),
      ),
    );
    await this.audit.appendInSchema(schema, {
      branchId: null,
      actorUserId: req.userId ?? null,
      tableName: 'fx_rates',
      recordId: row.id,
      action: 'upsert',
      newPayload: {
        fromCurrency: body.fromCurrency.trim().toUpperCase(),
        toCurrency: body.toCurrency.trim().toUpperCase(),
        rateType,
        rate: Number(body.rate),
        asOfDate: body.asOfDate.trim(),
      },
      entityType: 'fx_rate',
      entityId: row.id,
    });
    return {
      id: row.id,
      rate: Number(row.rate),
      updatedAt: row.updated_at.toISOString(),
      updatedBy: req.userId ?? null,
    };
  }

  @Get('consolidation-adjustments')
  async listConsolidationAdjustments(
    @Query('periodKey') periodKey?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('entityId') entityId?: string,
    @Query('status') status?: string,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const rows = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          id: string;
          period_key: string;
          scope_hash: string;
          entity_id: string | null;
          status: string;
          title: string;
          justification: string | null;
          lines: unknown;
          approved_by: string | null;
          approved_at: Date | null;
          applied_run_id: string | null;
          created_by: string | null;
          created_at: Date;
        }>
      >(
        `SELECT id::text, period_key, scope_hash, entity_id::text, status, title, justification, lines,
                approved_by::text, approved_at, applied_run_id::text, created_by::text, created_at
         FROM consolidation_adjustments
         WHERE ($1::text IS NULL OR period_key = $1)
           AND ($2::text IS NULL OR scope_hash = $2)
           AND ($3::uuid IS NULL OR entity_id = $3::uuid)
           AND ($4::text IS NULL OR status = $4)
         ORDER BY created_at DESC`,
        periodKey?.trim() || null,
        scopeHash?.trim() || null,
        entityId?.trim() || null,
        status?.trim() || null,
      ),
    );
    return { items: rows };
  }

  @Post('consolidation-adjustments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('run_consolidation')
  async createConsolidationAdjustment(
    @Req() req: Request,
    @Body()
    body: {
      periodKey: string;
      scopeHash: string;
      entityId?: string;
      title: string;
      justification?: string;
      lines: Array<{
        accountKey: string;
        debit: number;
        credit: number;
        memo?: string;
      }>;
    },
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const [row] = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string; created_at: Date }>>(
        `INSERT INTO consolidation_adjustments
         (period_key, scope_hash, entity_id, title, justification, lines, status, created_by)
         VALUES ($1, $2, $3::uuid, $4, $5, $6::jsonb, 'draft', $7::uuid)
         RETURNING id::text, created_at`,
        body.periodKey.trim(),
        body.scopeHash.trim(),
        body.entityId?.trim() || null,
        body.title.trim(),
        body.justification?.trim() || null,
        JSON.stringify(body.lines ?? []),
        req.userId ?? null,
      ),
    );
    await this.audit.appendInSchema(schema, {
      branchId: null,
      actorUserId: req.userId ?? null,
      tableName: 'consolidation_adjustments',
      recordId: row.id,
      action: 'create',
      newPayload: {
        periodKey: body.periodKey.trim(),
        scopeHash: body.scopeHash.trim(),
        entityId: body.entityId?.trim() || null,
        title: body.title.trim(),
        linesCount: body.lines?.length ?? 0,
      },
      entityType: 'consolidation_adjustment',
      entityId: row.id,
    });
    return {
      id: row.id,
      createdAt: row.created_at.toISOString(),
    };
  }

  @Post('consolidation-adjustments/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermissions('approve_consolidation_adjustments')
  async approveConsolidationAdjustment(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new BadRequestException('Invalid adjustment id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const [row] = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<
        Array<{ id: string; status: string; approved_at: Date }>
      >(
        `UPDATE consolidation_adjustments
         SET status = 'approved',
             approved_by = $2::uuid,
             approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING id::text, status, approved_at`,
        id,
        req.userId ?? null,
      ),
    );
    if (!row) throw new NotFoundException('Adjustment not found');
    await this.audit.appendInSchema(schema, {
      branchId: null,
      actorUserId: req.userId ?? null,
      tableName: 'consolidation_adjustments',
      recordId: row.id,
      action: 'approve',
      newPayload: {
        status: row.status,
      },
      entityType: 'consolidation_adjustment',
      entityId: row.id,
    });
    return {
      id: row.id,
      status: row.status,
      approvedAt: row.approved_at.toISOString(),
    };
  }

  @Get('trial-balance')
  async trialBalance(
    @Req() req: Request,
    @Query('asOf') asOf: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!asOf?.trim()) {
      throw new BadRequestException(
        'Query parameter asOf (YYYY-MM-DD) is required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.trialBalance(
      schema,
      branches,
      asOf.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('dashboard-series')
  async dashboardSeries(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.dashboardSeries(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('inventory-valuation')
  async inventoryValuation(
    @Req() req: Request,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.inventoryValuation(schema, branches);
    return this.withScopeMeta(payload, scope);
  }

  @Get('inventory-gl-sync')
  async inventoryGlSync(
    @Req() req: Request,
    @Query('asOf') asOf?: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const asOfDate = asOf?.trim() || new Date().toISOString().slice(0, 10);
    const rows = await this.reports.inventoryGlSync(
      schema,
      scope.branchIds,
      asOfDate,
    );
    return this.withScopeMeta({ asOfDate, rows }, scope);
  }

  @Get('alerts')
  async alerts(
    @Req() req: Request,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const items = await this.reports.getAlerts(schema, scope.branchIds);
    for (const item of items) {
      this.notifyControlAlertIfNeeded(
        schema,
        item.code,
        item.title,
        item.message,
      );
    }
    return this.withScopeMeta({ items }, scope);
  }

  @Get('variance-analysis')
  async varianceAnalysis(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('accountKey') accountKey: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    if (!from?.trim() || !to?.trim() || !accountKey?.trim()) {
      throw new BadRequestException(
        'from, to, and accountKey query parameters are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const rows = await this.reports.varianceAnalysis(
      schema,
      scope.branchIds,
      from.trim(),
      to.trim(),
      accountKey.trim(),
    );
    return this.withScopeMeta({ rows }, scope);
  }

  @Get('explain')
  async explain(
    @Req() req: Request,
    @Query('accountKey') accountKey: string,
    @Query('asOf') asOf?: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    if (!accountKey?.trim()) {
      throw new BadRequestException('accountKey query parameter is required');
    }
    const asOfDate = asOf?.trim() || new Date().toISOString().slice(0, 10);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.explainNumber(
      schema,
      scope.branchIds,
      accountKey.trim(),
      asOfDate,
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('top-products')
  async topProducts(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const lim = Math.min(50, Math.max(1, parseInt(limit ?? '10', 10) || 10));
    const sortKey =
      sort?.trim().toLowerCase() === 'quantity' ? 'quantity' : 'revenue';
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.topProducts(
      schema,
      branches,
      from.trim(),
      to.trim(),
      lim,
      sortKey,
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('cash-flow')
  async cashFlow(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('strictValidation') strictValidation?: string,
    @Query('scopeHash') scopeHash?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
    @Query('compareSnapshot') compareSnapshot?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.cashFlowStatement(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    const compare =
      compareFrom?.trim() && compareTo?.trim()
        ? await this.reports.cashFlowStatement(
            schema,
            branches,
            compareFrom.trim(),
            compareTo.trim(),
          )
        : null;
    const periodKey = `${from.trim()}::${to.trim()}`;
    const scopeKey = scopeHash?.trim() || 'scope:unspecified';
    const compareSnapshotRequested = this.parseBool(compareSnapshot);
    const priorCf = compareSnapshotRequested
      ? await this.reports.getPriorSnapshotBeforeToday(schema, {
          reportType: 'cash_flow',
          scopeHash: scopeKey,
          periodKey,
        })
      : null;
    const snapshotComparison = buildCashFlowSnapshotComparison(
      {
        operating: payload.sectionTotals.operating,
        investing: payload.sectionTotals.investing,
        financing: payload.sectionTotals.financing,
        netCashMovement: payload.netCashMovement,
      },
      priorCf,
    );
    const periodVariance = compare
      ? {
          operating: computeVariance(
            payload.sectionTotals.operating,
            compare.sectionTotals.operating,
          ),
          investing: computeVariance(
            payload.sectionTotals.investing,
            compare.sectionTotals.investing,
          ),
          financing: computeVariance(
            payload.sectionTotals.financing,
            compare.sectionTotals.financing,
          ),
          netCashMovement: computeVariance(
            payload.netCashMovement,
            compare.netCashMovement,
          ),
        }
      : null;
    const snapshotVariance = snapshotComparison
      ? buildCashFlowSnapshotVariance(
          {
            operating: payload.sectionTotals.operating,
            investing: payload.sectionTotals.investing,
            financing: payload.sectionTotals.financing,
            netCashMovement: payload.netCashMovement,
          },
          snapshotComparison.baseline,
        )
      : null;
    const validation = await this.reportValidation(
      req,
      schema,
      branches,
      { fromDate: from.trim(), toDate: to.trim() },
      [],
    );
    const finalization = await this.prisma.withTenantSchema(schema, (tx) =>
      this.lockDates.getReportFinalization(tx, branches, to.trim()),
    );
    const slowThresholdMs = 1200;
    const perfWarnings =
      (payload.elapsedMs ?? 0) > slowThresholdMs
        ? [
            {
              severity: 'warning' as const,
              code: 'report_slow',
              message: `Report generation took ${payload.elapsedMs}ms which is above ${slowThresholdMs}ms threshold.`,
            },
          ]
        : [];
    if (perfWarnings.length) {
      this.logger.warn(
        `Slow report detected: cash_flow (${payload.elapsedMs}ms, scope=${scopeHash ?? 'n/a'})`,
      );
    }
    const enrichedValidation = {
      ...validation,
      warnings: [...validation.warnings, ...perfWarnings],
    };
    enrichedValidation.reportStatus = this.resolveReportStatus(
      enrichedValidation.warnings,
    );
    enrichedValidation.isValid = enrichedValidation.reportStatus !== 'CRITICAL';
    if (this.parseBool(strictValidation) && !enrichedValidation.isValid) {
      throw new BadRequestException(
        'Strict validation enabled and critical reconciliation issues were detected.',
      );
    }

    const cfPeriodKey = `${from.trim()}::${to.trim()}`;
    this.notifyCriticalReportIfNeeded(
      schema,
      'cash_flow',
      cfPeriodKey,
      enrichedValidation.reportStatus,
      `Critical validation: Cash flow (${from.trim()}–${to.trim()})`,
      enrichedValidation.warnings.map((w) => w.message).join(' | ') ||
        'See report warnings.',
    );

    const hooks = this.exportHooksPaths();
    const preEnvelope = {
      ...payload,
      comparison: compare
        ? {
            fromDate: compareFrom?.trim(),
            toDate: compareTo?.trim(),
            sectionTotals: compare.sectionTotals,
            netCashMovement: compare.netCashMovement,
          }
        : null,
      snapshotComparison,
      variance: {
        vsPeriod: periodVariance,
        vsSnapshot: snapshotVariance,
      },
      exportHooks: { pdf: hooks.pdf, excel: hooks.excel },
      finalization: {
        isFinal: finalization.isFinal,
        lockDate: finalization.lockDate,
      },
      performance: {
        elapsedMs: payload.elapsedMs ?? null,
        thresholdMs: slowThresholdMs,
        isSlow: (payload.elapsedMs ?? 0) > slowThresholdMs,
      },
    };
    const snapshot = await this.reports.persistDailySnapshot(schema, {
      reportType: 'cash_flow',
      scopeHash: scopeHash?.trim() || 'scope:unspecified',
      periodKey: `${from.trim()}::${to.trim()}`,
      periodStart: from.trim(),
      periodEnd: to.trim(),
      reportStatus: enrichedValidation.reportStatus,
      isFinal: finalization.isFinal,
      lockDateUsed: finalization.lockDate,
      payload: {
        ...preEnvelope,
        warnings: enrichedValidation.warnings,
        reportStatus: enrichedValidation.reportStatus,
      },
    });
    const effectiveSnapshotComparison =
      snapshotComparison ||
      (compareSnapshotRequested
        ? {
            baselineSnapshotId: snapshot.snapshotId,
            baselineSnapshotDate: snapshot.snapshotDate,
            baselineVersion: snapshot.version,
            baseline: {
              operating: payload.sectionTotals.operating,
              investing: payload.sectionTotals.investing,
              financing: payload.sectionTotals.financing,
              netCashMovement: payload.netCashMovement,
            },
            deltas: {
              operating: 0,
              investing: 0,
              financing: 0,
              netCashMovement: 0,
            },
          }
        : null);
    const effectiveSnapshotVariance = effectiveSnapshotComparison
      ? buildCashFlowSnapshotVariance(
          {
            operating: payload.sectionTotals.operating,
            investing: payload.sectionTotals.investing,
            financing: payload.sectionTotals.financing,
            netCashMovement: payload.netCashMovement,
          },
          effectiveSnapshotComparison.baseline,
        )
      : null;
    return this.withScopeMeta(
      this.withValidationEnvelope(
        {
          ...preEnvelope,
          snapshotComparison: effectiveSnapshotComparison,
          variance: {
            ...preEnvelope.variance,
            vsSnapshot: effectiveSnapshotVariance,
          },
          snapshot: {
            id: snapshot.snapshotId,
            version: snapshot.version,
            snapshotDate: snapshot.snapshotDate,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
            snapshotDiff: snapshot.snapshotDiff ?? null,
          },
        },
        enrichedValidation,
      ),
      scope,
    );
  }

  @Get('partner-ledger')
  async partnerLedger(
    @Req() req: Request,
    @Query('partnerKind') partnerKind: string,
    @Query('partnerId') partnerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    const pk = partnerKind?.trim().toLowerCase();
    if (pk !== 'customer' && pk !== 'supplier') {
      throw new BadRequestException('partnerKind must be customer or supplier');
    }
    if (!partnerId?.trim() || !from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'partnerId, from, and to query parameters are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.partnerLedger(
      schema,
      branches,
      pk,
      partnerId.trim(),
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('aged-receivable')
  async agedReceivable(
    @Req() req: Request,
    @Query('asOf') asOf: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!asOf?.trim()) {
      throw new BadRequestException(
        'Query parameter asOf (YYYY-MM-DD) is required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.agedReceivable(
      schema,
      branches,
      asOf.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('aged-payable')
  async agedPayable(
    @Req() req: Request,
    @Query('asOf') asOf: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!asOf?.trim()) {
      throw new BadRequestException(
        'Query parameter asOf (YYYY-MM-DD) is required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.agedPayable(
      schema,
      branches,
      asOf.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('tax')
  async taxReport(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.taxReport(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('fiscal')
  async fiscalReport(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.fiscalReport(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('executive-summary')
  async executiveSummary(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.executiveSummary(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('invoice-analysis')
  async invoiceAnalysis(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.invoiceAnalysis(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('analytic')
  async analyticReport(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to (YYYY-MM-DD) are required',
      );
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const payload = await this.reports.analyticReport(
      schema,
      branches,
      from.trim(),
      to.trim(),
    );
    return this.withScopeMeta(payload, scope);
  }

  @Get('journal-audit')
  async journalAudit(
    @Req() req: Request,
    @Query('asOf') asOf: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
  ) {
    this.ensureTenant();
    const scope = this.reportBranchScope(
      req,
      branchId,
      branchIds,
      aggregateAll,
    );
    const branches = scope.branchIds;
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const dateStr = asOf?.trim() || new Date().toISOString().slice(0, 10);
    const payload = await this.reports.journalAudit(schema, branches, dateStr);
    return this.withScopeMeta(payload, scope);
  }

  @Post('exports')
  async enqueueReportExport(
    @Req() req: Request,
    @Body() body: CreateReportExportJobDto,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const scope = this.reportBranchScope(
      req,
      body.branchId,
      body.branchIds,
      body.aggregateAll === true ? 'true' : undefined,
    );
    const branches = scope.branchIds;
    if (!branches.length) {
      throw new BadRequestException(
        'Branch scope is empty; pick a branch or enable aggregate-all.',
      );
    }
    if (body.reportType === 'balance_sheet') {
      if (!body.asOf?.trim()) {
        throw new BadRequestException(
          'asOf is required for balance_sheet export',
        );
      }
      if (body.consolidated === true && branches.length <= 1) {
        throw new BadRequestException(
          'consolidated export requires more than one branch in scope.',
        );
      }
    } else {
      if (!body.from?.trim() || !body.to?.trim()) {
        throw new BadRequestException(
          'from and to are required for this report export',
        );
      }
    }
    const format = body.format === 'pdf' ? 'pdf' : 'xlsx';
    const { id } = await this.exportJobs.createPendingJob(schema, {
      reportType: body.reportType,
      format,
      params: {
        branchIds: branches,
        from: body.from?.trim(),
        to: body.to?.trim(),
        asOf: body.asOf?.trim(),
        scopeHash: body.scopeHash?.trim(),
        consolidated: body.consolidated === true ? true : undefined,
      },
      createdBy: req.userId ?? null,
    });
    return { id, status: 'pending' as const };
  }

  @Get('exports/:jobId')
  async reportExportStatus(@Req() req: Request, @Param('jobId') jobId: string) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      throw new BadRequestException('Invalid job id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const job = await this.exportJobs.getJob(schema, jobId);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }
    return {
      id: job.id,
      status: job.status,
      reportType: job.reportType,
      format: job.format,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      downloadReady: job.status === 'completed' && Boolean(job.storagePath),
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
    };
  }

  @Get('exports/:jobId/download')
  async downloadReportExport(
    @Req() req: Request,
    @Param('jobId') jobId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      throw new BadRequestException('Invalid job id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const job = await this.exportJobs.getJob(schema, jobId);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }
    if (job.status !== 'completed' || !job.storagePath) {
      throw new BadRequestException('Export is not ready for download');
    }
    if (new Date(job.expiresAt) <= new Date()) {
      throw new BadRequestException('Export has expired');
    }
    if (!/^export-[0-9a-f-]{36}\.(pdf|xlsx)$/i.test(job.storagePath)) {
      throw new BadRequestException('Invalid storage reference');
    }
    const dir = path.resolve(
      process.env.REPORT_EXPORT_DIR ?? 'tmp/report-exports',
    );
    const full = path.join(dir, job.storagePath);
    if (!existsSync(full)) {
      throw new NotFoundException('Export file missing');
    }
    const isPdf = job.storagePath.toLowerCase().endsWith('.pdf');
    res.setHeader(
      'Content-Type',
      isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${jobId.slice(0, 8)}.${isPdf ? 'pdf' : 'xlsx'}"`,
    );
    createReadStream(full).pipe(res);
  }
}
