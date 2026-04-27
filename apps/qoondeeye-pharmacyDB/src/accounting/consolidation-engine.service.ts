import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchColumnPredicate } from '../common/branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  ConsolidationEnterpriseService,
  type FxRateType,
} from './consolidation-enterprise.service';
import { ChartOfAccountsSeedService } from './chart-of-accounts-seed.service';
import { EntityHierarchyService } from './entity-hierarchy.service';
import { FinancialReportsService } from './financial-reports.service';
import { JournalService, type JournalLineInput } from './journal.service';

const EPS = 0.01;

export type ConsolidationRunStatus =
  | 'draft'
  | 'posted'
  | 'finalized'
  | 'reversed';

export type ConsolidationFxPolicy = {
  bs: FxRateType;
  pnl: FxRateType;
  equity: FxRateType;
};

export type ConsolidationRunItem = {
  id: string;
  periodKey: string;
  asOfDate: string;
  fromDate: string;
  toDate: string;
  scopeHash: string;
  scopeBranchIds: string[];
  entityId: string | null;
  status: ConsolidationRunStatus;
  createdBy: string | null;
  reversedBy: string | null;
  postedAt: string;
  reversedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ConsolidationEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: FinancialReportsService,
    private readonly journals: JournalService,
    private readonly coaSeed: ChartOfAccountsSeedService,
    private readonly audit: AuditLogService,
    private readonly entityHierarchy: EntityHierarchyService,
    private readonly enterprise: ConsolidationEnterpriseService,
  ) {}

  private async bumpMetric(
    tx: Prisma.TransactionClient,
    metricKey: string,
    outcome: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO ops_metric_counters (metric_date, metric_key, outcome, metric_count, last_payload, updated_at)
       VALUES (CURRENT_DATE, $1, $2, 1, $3::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (metric_date, metric_key, outcome)
       DO UPDATE SET
         metric_count = ops_metric_counters.metric_count + 1,
         last_payload = EXCLUDED.last_payload,
         updated_at = CURRENT_TIMESTAMP`,
      metricKey,
      outcome,
      JSON.stringify(payload),
    );
  }

  private async resolveConsolidationBranchId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const [branch] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text AS id
       FROM branches
       WHERE LOWER(TRIM(name)) = 'consolidation'
       ORDER BY created_at ASC
       LIMIT 1`,
    );
    if (branch?.id) return branch.id;
    const [created] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO branches (name)
       VALUES ('CONSOLIDATION')
       RETURNING id::text AS id`,
    );
    return created.id;
  }

  private async loadRunOrFail(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<ConsolidationRunItem> {
    const [row] = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        period_key: string;
        as_of_date: string;
        from_date: string;
        to_date: string;
        scope_hash: string;
        scope_branch_ids: unknown;
        entity_id: string | null;
        status: ConsolidationRunStatus;
        created_by: string | null;
        reversed_by: string | null;
        posted_at: Date;
        reversed_at: Date | null;
        finalized_at: Date | null;
        finalized_by: string | null;
        metadata: Record<string, unknown> | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `SELECT id::text,
              period_key,
              as_of_date::text,
              from_date::text,
              to_date::text,
              scope_hash,
              scope_branch_ids,
              entity_id::text,
              status,
              created_by::text,
              reversed_by::text,
              posted_at,
              reversed_at,
              finalized_at,
              finalized_by::text,
              metadata,
              created_at,
              updated_at
       FROM consolidation_runs
       WHERE id = $1::uuid
       LIMIT 1`,
      runId,
    );
    if (!row) throw new NotFoundException('Consolidation run not found');
    const branchIds = Array.isArray(row.scope_branch_ids)
      ? row.scope_branch_ids.map((x) => String(x))
      : [];
    return {
      id: row.id,
      periodKey: row.period_key,
      asOfDate: row.as_of_date,
      fromDate: row.from_date,
      toDate: row.to_date,
      scopeHash: row.scope_hash,
      scopeBranchIds: branchIds,
      entityId: row.entity_id,
      status: row.status,
      createdBy: row.created_by,
      reversedBy: row.reversed_by,
      postedAt: row.posted_at.toISOString(),
      reversedAt: row.reversed_at ? row.reversed_at.toISOString() : null,
      finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
      finalizedBy: row.finalized_by,
      metadata: row.metadata ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async reverseRunInTx(
    tx: Prisma.TransactionClient,
    run: ConsolidationRunItem,
    actorUserId: string | null,
    reason: string,
  ): Promise<string[]> {
    if (
      (run.status !== 'posted' && run.status !== 'finalized') ||
      run.reversedAt
    ) {
      return [];
    }
    const rows = await tx.$queryRawUnsafe<Array<{ journal_entry_id: string }>>(
      `SELECT DISTINCT journal_entry_id::text
       FROM consolidation_journal_links
       WHERE run_id = $1::uuid
       ORDER BY journal_entry_id::text`,
      run.id,
    );
    const reversalJournalIds: string[] = [];
    for (const row of rows) {
      const [je] = await tx.$queryRawUnsafe<
        Array<{ branch_id: string; entry_date: string }>
      >(
        `SELECT branch_id::text, entry_date::text
         FROM journal_entries
         WHERE id = $1::uuid
         LIMIT 1`,
        row.journal_entry_id,
      );
      if (!je) continue;
      const lineRows = await tx.$queryRawUnsafe<
        Array<{ account_id: string; debit: string; credit: string }>
      >(
        `SELECT account_id::text,
                debit::text,
                credit::text
         FROM journal_lines
         WHERE journal_entry_id = $1::uuid`,
        row.journal_entry_id,
      );
      const lines: JournalLineInput[] = lineRows
        .map((line) => ({
          accountId: line.account_id,
          debit: Number(line.credit),
          credit: Number(line.debit),
        }))
        .filter((line) => line.debit > 0 || line.credit > 0);
      if (!lines.length) continue;
      const reversal = await this.journals.createBalancedEntry(tx, {
        branchId: je.branch_id,
        entryDate: run.toDate,
        description: `Consolidation reversal ${run.id}`,
        sourceType: 'consolidation_reversal',
        sourceId: null,
        lines,
      });
      if (reversal?.id) reversalJournalIds.push(reversal.id);
    }

    await tx.$executeRawUnsafe(
      `UPDATE consolidation_runs
       SET status = 'reversed',
           reversed_by = $2::uuid,
           reversed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      run.id,
      actorUserId,
    );
    await tx.$executeRawUnsafe(
      `UPDATE consolidation_adjustments
       SET status = 'approved',
           applied_run_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE applied_run_id = $1::uuid`,
      run.id,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO consolidation_run_events (run_id, event_type, actor_user_id, payload)
       VALUES ($1::uuid, 'reversed', $2::uuid, $3::jsonb)`,
      run.id,
      actorUserId,
      JSON.stringify({
        reason,
        reversalJournalIds,
      }),
    );
    await this.audit.append(tx, {
      branchId: null,
      actorUserId,
      tableName: 'consolidation_runs',
      recordId: run.id,
      action: 'reverse',
      oldPayload: { status: run.status },
      newPayload: {
        status: 'reversed',
        reason,
        reversalJournalIds,
      },
      entityType: 'consolidation_run',
      entityId: run.id,
    });
    await this.bumpMetric(tx, 'consolidation_run', 'reversed', {
      runId: run.id,
      reason,
      reversalJournalIds,
    });
    return reversalJournalIds;
  }

  async runConsolidation(params: {
    schemaName: string;
    periodKey: string;
    asOfDate: string;
    fromDate: string;
    toDate: string;
    scopeHash: string;
    branchIds: string[];
    entityId?: string;
    asOfFxDate?: string;
    groupCurrency?: string;
    ratePolicy?: FxRateType;
    /** IAS-style multi-rate translation; when absent, `ratePolicy` applies to all legs (legacy). */
    fxPolicy?: ConsolidationFxPolicy;
    includeAdjustments?: boolean;
    actorUserId: string | null;
    dryRun?: boolean;
    /** Persist a draft row (no GL postings) for review. */
    asDraft?: boolean;
    /** Delete this draft run id before posting (same scope/period). */
    replaceDraftRunId?: string;
  }): Promise<{ run: ConsolidationRunItem; reversedRunId: string | null }> {
    const periodKey = params.periodKey.trim();
    const asOfDate = params.asOfDate.trim();
    const fromDate = params.fromDate.trim();
    const toDate = params.toDate.trim();
    let resolvedEntityScope: {
      entityId: string;
      descendantEntityIds: string[];
      branchIds: string[];
      branchOwnership: Record<string, number>;
      entityOwnership: Record<string, number>;
      descendantCount: number;
      branchCount: number;
    } | null = null;
    let effectiveBranchIds = [...params.branchIds];
    let parentShareWeight = 1;
    if (params.entityId) {
      resolvedEntityScope = await this.entityHierarchy.resolveScopeByEntity(
        params.schemaName,
        params.entityId,
        toDate,
      );
      effectiveBranchIds = resolvedEntityScope.branchIds;
      if (resolvedEntityScope.branchCount <= 0) {
        throw new BadRequestException(
          'Selected entity has no mapped branches for consolidation',
        );
      }
      const ownershipValues = Object.values(
        resolvedEntityScope.branchOwnership,
      );
      if (ownershipValues.length) {
        parentShareWeight =
          ownershipValues.reduce((sum, v) => sum + Number(v), 0) /
          ownershipValues.length;
      }
    }
    if (effectiveBranchIds.length <= 1) {
      throw new BadRequestException(
        'Consolidation run requires more than one branch in scope',
      );
    }
    if (
      process.env.CONSOLIDATION_ENGINE_V1 &&
      !['1', 'true', 'yes', 'on'].includes(
        process.env.CONSOLIDATION_ENGINE_V1.trim().toLowerCase(),
      )
    ) {
      throw new BadRequestException(
        'Consolidation engine is disabled by CONSOLIDATION_ENGINE_V1',
      );
    }

    const readiness = await this.reports.getCloseReadiness(
      params.schemaName,
      effectiveBranchIds,
      toDate,
    );
    if (readiness.status === 'CRITICAL') {
      throw new BadRequestException(
        'Cannot run consolidation while close-readiness is CRITICAL',
      );
    }

    const balanceSheet = await this.reports.balanceSheet(
      params.schemaName,
      effectiveBranchIds,
      asOfDate,
      { consolidated: false },
    );
    const incomeStatement = await this.reports.incomeStatement(
      params.schemaName,
      effectiveBranchIds,
      fromDate,
      toDate,
      { monthlyBreakdown: false },
    );
    const grossDueFrom =
      balanceSheet.lines.find((l) => l.accountKey === 'due_from_branch')
        ?.balance ?? 0;
    const grossDueTo =
      balanceSheet.lines.find((l) => l.accountKey === 'due_to_branch')
        ?.balance ?? 0;
    const residual = round2(grossDueFrom - grossDueTo);
    const interRev = round2(incomeStatement.intercompany.revenue);
    const interCogs = round2(incomeStatement.intercompany.cogs);
    const interExp = round2(incomeStatement.intercompany.expenses - interCogs);
    const pnlImbalance = round2(interRev - interCogs - interExp);
    const nciShare = round2(Math.max(0, 1 - parentShareWeight));
    const nciBaseNetIncome = round2(incomeStatement.netIncome);
    const nciAmount = round2(nciBaseNetIncome * nciShare);

    const fxDate = (params.asOfFxDate ?? toDate).trim();
    const groupCurrency = params.groupCurrency?.trim().toUpperCase() || null;
    const legacyRate: FxRateType = params.ratePolicy ?? 'closing';
    const fxPolicy: ConsolidationFxPolicy = params.fxPolicy
      ? {
          bs: params.fxPolicy.bs ?? 'closing',
          pnl: params.fxPolicy.pnl ?? 'average',
          equity: params.fxPolicy.equity ?? 'historical',
        }
      : {
          bs: legacyRate,
          pnl: legacyRate,
          equity: legacyRate,
        };

    if (params.dryRun) {
      const run = {
        id: 'dry-run',
        periodKey,
        asOfDate,
        fromDate,
        toDate,
        scopeHash: params.scopeHash,
        scopeBranchIds: effectiveBranchIds,
        entityId: params.entityId ?? null,
        status: 'posted' as const,
        createdBy: params.actorUserId,
        reversedBy: null,
        postedAt: new Date().toISOString(),
        reversedAt: null,
        finalizedAt: null,
        finalizedBy: null,
        metadata: {
          dryRun: true,
          entityScope: resolvedEntityScope,
          ownership: {
            parentShareWeight: round2(parentShareWeight),
            nciShare,
            nciAmount,
          },
          fx: {
            fxDate,
            groupCurrency,
            ratePolicy: legacyRate,
            fxPolicy,
          },
          balances: { grossDueFrom, grossDueTo, residual },
          pnl: { interRev, interCogs, interExp, pnlImbalance },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { run, reversedRunId: null };
    }

    try {
      return await this.prisma.withTenantSchema(
        params.schemaName,
        async (tx) => {
          const [workflow] = await tx.$queryRawUnsafe<
            Array<{ state: string | null }>
          >(
            `SELECT state
         FROM accounting_period_workflow
         WHERE scope_hash = $1
           AND period_key = $2
         LIMIT 1`,
            params.scopeHash,
            periodKey,
          );
          if ((workflow?.state ?? '').toLowerCase() === 'closed') {
            throw new BadRequestException(
              'Cannot run consolidation for a closed period. Reopen the period first.',
            );
          }

          const branchId = await this.resolveConsolidationBranchId(tx);
          const accountIds = await this.coaSeed.ensureAccountsForBranch(
            tx,
            branchId,
          );
          const nciEquityAccountId =
            await this.enterprise.ensureConsolidationAccount(tx, {
              branchId,
              accountKey: 'nci_equity',
              name: 'Non-controlling interest',
              accountType: 'equity',
            });
          const nciCurrentYearAccountId =
            await this.enterprise.ensureConsolidationAccount(tx, {
              branchId,
              accountKey: 'nci_current_year',
              name: 'NCI current-year earnings',
              accountType: 'equity',
            });
          const ctaReserveAccountId =
            await this.enterprise.ensureConsolidationAccount(tx, {
              branchId,
              accountKey: 'cta_reserve',
              name: 'Cumulative translation adjustment',
              accountType: 'equity',
            });

          let translatedNetIncome = nciBaseNetIncome;
          let ctaAmount = 0;
          let pnlFxRate = 1;
          let closingFxRate = 1;
          let equityFxRate = 1;
          if (groupCurrency && params.entityId) {
            this.enterprise.assertFxEnabled();
            const entityCurrency = await this.enterprise.resolveEntityCurrency(
              tx,
              params.entityId,
            );
            pnlFxRate = await this.enterprise.resolveFxRate(tx, {
              fromCurrency: entityCurrency,
              toCurrency: groupCurrency,
              rateType: fxPolicy.pnl,
              asOfDate: fxDate,
            });
            closingFxRate = await this.enterprise.resolveFxRate(tx, {
              fromCurrency: entityCurrency,
              toCurrency: groupCurrency,
              rateType: fxPolicy.bs,
              asOfDate: fxDate,
            });
            try {
              equityFxRate = await this.enterprise.resolveFxRate(tx, {
                fromCurrency: entityCurrency,
                toCurrency: groupCurrency,
                rateType: fxPolicy.equity,
                asOfDate: fxDate,
              });
            } catch {
              equityFxRate = closingFxRate;
            }
            translatedNetIncome = round2(nciBaseNetIncome * pnlFxRate);
            ctaAmount = round2(
              nciBaseNetIncome * closingFxRate - nciBaseNetIncome * pnlFxRate,
            );
          }

          if (params.replaceDraftRunId?.trim()) {
            const draftRun = await this.loadRunOrFail(
              tx,
              params.replaceDraftRunId.trim(),
            );
            if (draftRun.status !== 'draft') {
              throw new BadRequestException(
                'replaceDraftRunId must reference a draft run',
              );
            }
            if (
              draftRun.periodKey !== periodKey ||
              draftRun.scopeHash !== params.scopeHash
            ) {
              throw new BadRequestException(
                'Draft run scope does not match consolidation request',
              );
            }
            await tx.$executeRawUnsafe(
              `DELETE FROM consolidation_runs WHERE id = $1::uuid`,
              draftRun.id,
            );
          }

          const [existing] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id::text
         FROM consolidation_runs
         WHERE period_key = $1
           AND scope_hash = $2
           AND reversed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
            periodKey,
            params.scopeHash,
          );

          const reversedRunId: string | null = null;
          if (existing?.id) {
            const prior = await this.loadRunOrFail(tx, existing.id);
            if (prior.status === 'finalized') {
              throw new BadRequestException(
                'A finalized consolidation run exists for this period and scope. Reverse it before posting a new run.',
              );
            }
            if (prior.status === 'posted') {
              throw new BadRequestException(
                'Reverse the posted consolidation run before posting a new one.',
              );
            }
            if (prior.status === 'draft') {
              await tx.$executeRawUnsafe(
                `DELETE FROM consolidation_runs WHERE id = $1::uuid`,
                prior.id,
              );
            }
          }

          const runMetadata = {
            entityScope: resolvedEntityScope,
            ownership: {
              parentShareWeight: round2(parentShareWeight),
              nciShare,
              nciAmount,
            },
            fx: {
              fxDate,
              groupCurrency,
              legacyRatePolicy: legacyRate,
              fxPolicy,
              pnlFxRate,
              closingFxRate,
              equityFxRate,
              translatedNetIncome,
              ctaAmount,
            },
            balances: { grossDueFrom, grossDueTo, residual },
            pnl: { interRev, interCogs, interExp, pnlImbalance },
          };

          if (params.asDraft === true) {
            const [draftRow] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
              `INSERT INTO consolidation_runs (
            period_key, as_of_date, from_date, to_date, scope_hash, scope_branch_ids, entity_id, status, created_by, metadata
          )
          VALUES ($1, $2::date, $3::date, $4::date, $5, $6::jsonb, $7::uuid, 'draft', $8::uuid, $9::jsonb)
          RETURNING id::text`,
              periodKey,
              asOfDate,
              fromDate,
              toDate,
              params.scopeHash,
              JSON.stringify(effectiveBranchIds),
              params.entityId ?? null,
              params.actorUserId,
              JSON.stringify(runMetadata),
            );
            const draftId = draftRow.id;
            await tx.$executeRawUnsafe(
              `INSERT INTO consolidation_run_events (run_id, event_type, actor_user_id, payload)
           VALUES ($1::uuid, 'draft_saved', $2::uuid, $3::jsonb)`,
              draftId,
              params.actorUserId,
              JSON.stringify({ periodKey }),
            );
            const run = await this.loadRunOrFail(tx, draftId);
            return { run, reversedRunId: null };
          }

          const [created] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `INSERT INTO consolidation_runs (
          period_key, as_of_date, from_date, to_date, scope_hash, scope_branch_ids, entity_id, status, created_by, metadata
        )
        VALUES ($1, $2::date, $3::date, $4::date, $5, $6::jsonb, $7::uuid, 'posted', $8::uuid, $9::jsonb)
        RETURNING id::text`,
            periodKey,
            asOfDate,
            fromDate,
            toDate,
            params.scopeHash,
            JSON.stringify(effectiveBranchIds),
            params.entityId ?? null,
            params.actorUserId,
            JSON.stringify(runMetadata),
          );

          const runId = created.id;
          const createdJournalIds: string[] = [];
          if (Math.abs(residual) > EPS) {
            const bsLines: JournalLineInput[] =
              residual > 0
                ? [
                    {
                      accountId: accountIds.due_to_branch,
                      debit: Math.abs(residual),
                      credit: 0,
                    },
                    {
                      accountId: accountIds.due_from_branch,
                      debit: 0,
                      credit: Math.abs(residual),
                    },
                  ]
                : [
                    {
                      accountId: accountIds.due_from_branch,
                      debit: Math.abs(residual),
                      credit: 0,
                    },
                    {
                      accountId: accountIds.due_to_branch,
                      debit: 0,
                      credit: Math.abs(residual),
                    },
                  ];
            const bsJournal = await this.journals.createBalancedEntry(tx, {
              branchId,
              entryDate: asOfDate,
              description: `Consolidation BS elimination ${periodKey}`,
              sourceType: 'consolidation_bs',
              sourceId: runId,
              lines: bsLines,
            });
            if (bsJournal?.id) {
              createdJournalIds.push(bsJournal.id);
              for (const line of bsLines) {
                const direction = line.debit > 0 ? 'debit' : 'credit';
                const accountKey =
                  line.accountId === accountIds.due_from_branch
                    ? 'due_from_branch'
                    : 'due_to_branch';
                await tx.$executeRawUnsafe(
                  `INSERT INTO consolidation_journal_links
               (run_id, journal_entry_id, elimination_type, account_key, direction, amount, source_refs)
               VALUES ($1::uuid, $2::uuid, 'balance_sheet', $3, $4, $5, $6::jsonb)`,
                  runId,
                  bsJournal.id,
                  accountKey,
                  direction,
                  round2(line.debit || line.credit),
                  JSON.stringify({ residual }),
                );
              }
            }
          }

          const pnlLines: JournalLineInput[] = [];
          if (interRev > EPS) {
            pnlLines.push({
              accountId: accountIds.sales_revenue,
              debit: interRev,
              credit: 0,
            });
          }
          if (interCogs > EPS) {
            pnlLines.push({
              accountId: accountIds.cogs,
              debit: 0,
              credit: interCogs,
            });
          }
          if (interExp > EPS) {
            pnlLines.push({
              accountId: accountIds.operating_expense,
              debit: 0,
              credit: interExp,
            });
          }
          const pnlDebit = round2(pnlLines.reduce((s, x) => s + x.debit, 0));
          const pnlCredit = round2(pnlLines.reduce((s, x) => s + x.credit, 0));
          const pnlDelta = round2(pnlDebit - pnlCredit);
          if (Math.abs(pnlDelta) > EPS) {
            if (pnlDelta > 0) {
              pnlLines.push({
                accountId: accountIds.equity_retained,
                debit: 0,
                credit: Math.abs(pnlDelta),
              });
            } else {
              pnlLines.push({
                accountId: accountIds.equity_retained,
                debit: Math.abs(pnlDelta),
                credit: 0,
              });
            }
          }
          if (pnlLines.length >= 2) {
            const pnlJournal = await this.journals.createBalancedEntry(tx, {
              branchId,
              entryDate: toDate,
              description: `Consolidation P&L elimination ${periodKey}`,
              sourceType: 'consolidation_pnl',
              sourceId: runId,
              lines: pnlLines,
            });
            if (pnlJournal?.id) {
              createdJournalIds.push(pnlJournal.id);
              for (const line of pnlLines) {
                const direction = line.debit > 0 ? 'debit' : 'credit';
                let accountKey = 'equity_retained';
                if (line.accountId === accountIds.sales_revenue) {
                  accountKey = 'sales_revenue';
                } else if (line.accountId === accountIds.cogs) {
                  accountKey = 'cogs';
                } else if (line.accountId === accountIds.operating_expense) {
                  accountKey = 'operating_expense';
                }
                await tx.$executeRawUnsafe(
                  `INSERT INTO consolidation_journal_links
               (run_id, journal_entry_id, elimination_type, account_key, direction, amount, source_refs)
               VALUES ($1::uuid, $2::uuid, 'profit_loss', $3, $4, $5, $6::jsonb)`,
                  runId,
                  pnlJournal.id,
                  accountKey,
                  direction,
                  round2(line.debit || line.credit),
                  JSON.stringify({ interRev, interCogs, interExp }),
                );
              }
            }
          }

          if (Math.abs(nciAmount) > EPS) {
            const nciLines: JournalLineInput[] =
              nciAmount > 0
                ? [
                    {
                      accountId: accountIds.equity_retained,
                      debit: Math.abs(nciAmount),
                      credit: 0,
                    },
                    {
                      accountId: nciCurrentYearAccountId,
                      debit: 0,
                      credit: Math.abs(nciAmount),
                    },
                  ]
                : [
                    {
                      accountId: nciCurrentYearAccountId,
                      debit: Math.abs(nciAmount),
                      credit: 0,
                    },
                    {
                      accountId: accountIds.equity_retained,
                      debit: 0,
                      credit: Math.abs(nciAmount),
                    },
                  ];
            const nciJournal = await this.journals.createBalancedEntry(tx, {
              branchId,
              entryDate: toDate,
              description: `Consolidation NCI allocation ${periodKey}`,
              sourceType: 'consolidation_pnl',
              sourceId: runId,
              lines: nciLines,
            });
            if (nciJournal?.id) {
              createdJournalIds.push(nciJournal.id);
              await tx.$executeRawUnsafe(
                `INSERT INTO consolidation_journal_links
             (run_id, journal_entry_id, elimination_type, account_key, direction, amount, source_refs)
             VALUES ($1::uuid, $2::uuid, 'nci_allocation', 'nci_current_year', $3, $4, $5::jsonb)`,
                runId,
                nciJournal.id,
                nciAmount > 0 ? 'credit' : 'debit',
                Math.abs(nciAmount),
                JSON.stringify({
                  nciShare,
                  nciBaseNetIncome,
                  parentShareWeight,
                }),
              );
            }
            const nciReclassLines: JournalLineInput[] =
              nciAmount > 0
                ? [
                    {
                      accountId: nciCurrentYearAccountId,
                      debit: Math.abs(nciAmount),
                      credit: 0,
                    },
                    {
                      accountId: nciEquityAccountId,
                      debit: 0,
                      credit: Math.abs(nciAmount),
                    },
                  ]
                : [
                    {
                      accountId: nciEquityAccountId,
                      debit: Math.abs(nciAmount),
                      credit: 0,
                    },
                    {
                      accountId: nciCurrentYearAccountId,
                      debit: 0,
                      credit: Math.abs(nciAmount),
                    },
                  ];
            const nciEquityJournal = await this.journals.createBalancedEntry(
              tx,
              {
                branchId,
                entryDate: asOfDate,
                description: `Consolidation NCI equity reclass ${periodKey}`,
                sourceType: 'consolidation_bs',
                sourceId: runId,
                lines: nciReclassLines,
              },
            );
            if (nciEquityJournal?.id) {
              createdJournalIds.push(nciEquityJournal.id);
              await tx.$executeRawUnsafe(
                `INSERT INTO consolidation_journal_links
             (run_id, journal_entry_id, elimination_type, account_key, direction, amount, source_refs)
             VALUES ($1::uuid, $2::uuid, 'nci_equity', 'nci_equity', $3, $4, $5::jsonb)`,
                runId,
                nciEquityJournal.id,
                nciAmount > 0 ? 'credit' : 'debit',
                Math.abs(nciAmount),
                JSON.stringify({ nciShare }),
              );
            }
          }

          if (Math.abs(ctaAmount) > EPS) {
            const ctaLines: JournalLineInput[] =
              ctaAmount > 0
                ? [
                    {
                      accountId: accountIds.equity_retained,
                      debit: Math.abs(ctaAmount),
                      credit: 0,
                    },
                    {
                      accountId: ctaReserveAccountId,
                      debit: 0,
                      credit: Math.abs(ctaAmount),
                    },
                  ]
                : [
                    {
                      accountId: ctaReserveAccountId,
                      debit: Math.abs(ctaAmount),
                      credit: 0,
                    },
                    {
                      accountId: accountIds.equity_retained,
                      debit: 0,
                      credit: Math.abs(ctaAmount),
                    },
                  ];
            const ctaJournal = await this.journals.createBalancedEntry(tx, {
              branchId,
              entryDate: fxDate,
              description: `Consolidation CTA posting ${periodKey}`,
              sourceType: 'consolidation_bs',
              sourceId: runId,
              lines: ctaLines,
            });
            if (ctaJournal?.id) {
              createdJournalIds.push(ctaJournal.id);
              await tx.$executeRawUnsafe(
                `INSERT INTO consolidation_journal_links
             (run_id, journal_entry_id, elimination_type, account_key, direction, amount, source_refs)
             VALUES ($1::uuid, $2::uuid, 'cta_translation', 'cta_reserve', $3, $4, $5::jsonb)`,
                runId,
                ctaJournal.id,
                ctaAmount > 0 ? 'credit' : 'debit',
                Math.abs(ctaAmount),
                JSON.stringify({
                  fxDate,
                  groupCurrency,
                  legacyRatePolicy: legacyRate,
                  fxPolicy,
                  pnlFxRate,
                  closingFxRate,
                  translatedNetIncome,
                }),
              );
            }
          }

          if (params.includeAdjustments !== false) {
            let adjustmentsApplied = 0;
            try {
              const adjustments =
                await this.enterprise.listApprovedAdjustmentsInTx(tx, {
                  periodKey,
                  scopeHash: params.scopeHash,
                  entityId: params.entityId,
                });
              for (const adjustment of adjustments) {
                const lines: JournalLineInput[] = [];
                for (const rawLine of adjustment.lines) {
                  const accountId =
                    await this.enterprise.ensureConsolidationAccount(tx, {
                      branchId,
                      accountKey: rawLine.accountKey,
                      name: rawLine.accountKey.replace(/_/g, ' '),
                      accountType: rawLine.accountKey.includes('revenue')
                        ? 'income'
                        : 'equity',
                    });
                  lines.push({
                    accountId,
                    debit: round2(Number(rawLine.debit ?? 0)),
                    credit: round2(Number(rawLine.credit ?? 0)),
                  });
                }
                if (lines.length < 2) continue;
                const adjJournal = await this.journals.createBalancedEntry(tx, {
                  branchId,
                  entryDate: toDate,
                  description: `Manual consolidation adjustment ${adjustment.title}`,
                  sourceType: 'consolidation_bs',
                  sourceId: runId,
                  lines,
                });
                if (!adjJournal?.id) continue;
                createdJournalIds.push(adjJournal.id);
                adjustmentsApplied += 1;
                await tx.$executeRawUnsafe(
                  `UPDATE consolidation_adjustments
               SET status = 'applied',
                   applied_run_id = $2::uuid,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1::uuid`,
                  adjustment.id,
                  runId,
                );
                await tx.$executeRawUnsafe(
                  `INSERT INTO consolidation_journal_links
               (run_id, journal_entry_id, elimination_type, account_key, direction, amount, source_refs)
               VALUES ($1::uuid, $2::uuid, 'manual_adjustment', null, null, 0, $3::jsonb)`,
                  runId,
                  adjJournal.id,
                  JSON.stringify({
                    adjustmentId: adjustment.id,
                    title: adjustment.title,
                  }),
                );
              }
              if (adjustmentsApplied > 0) {
                await this.bumpMetric(
                  tx,
                  'consolidation_adjustments',
                  'applied',
                  {
                    runId,
                    count: adjustmentsApplied,
                  },
                );
              }
            } catch (e) {
              if (
                (e as Error).message.includes(
                  'disabled by CONSOLIDATION_ADJUSTMENTS_V1',
                )
              ) {
                /* adjustments intentionally disabled */
              } else {
                throw e;
              }
            }
          }

          await tx.$executeRawUnsafe(
            `INSERT INTO consolidation_run_events (run_id, event_type, actor_user_id, payload)
         VALUES ($1::uuid, 'posted', $2::uuid, $3::jsonb)`,
            runId,
            params.actorUserId,
            JSON.stringify({
              periodKey,
              branchIds: effectiveBranchIds,
              entityId: params.entityId ?? null,
              nciAmount,
              ctaAmount,
              fxDate,
              groupCurrency,
              legacyRatePolicy: legacyRate,
              fxPolicy,
              createdJournalIds,
              reversedRunId,
            }),
          );
          await this.audit.append(tx, {
            branchId,
            actorUserId: params.actorUserId,
            tableName: 'consolidation_runs',
            recordId: runId,
            action: 'post',
            oldPayload: null,
            newPayload: {
              periodKey,
              scopeHash: params.scopeHash,
              branchIds: effectiveBranchIds,
              entityId: params.entityId ?? null,
              nciAmount,
              ctaAmount,
              fxDate,
              groupCurrency,
              legacyRatePolicy: legacyRate,
              fxPolicy,
              createdJournalIds,
              reversedRunId,
            },
            entityType: 'consolidation_run',
            entityId: runId,
          });
          await this.bumpMetric(tx, 'consolidation_run', 'posted', {
            runId,
            periodKey,
            branchCount: effectiveBranchIds.length,
            entityId: params.entityId ?? null,
            journalCount: createdJournalIds.length,
            nciAmount,
            ctaAmount,
            reversedRunId,
          });

          const run = await this.loadRunOrFail(tx, runId);
          return { run, reversedRunId };
        },
      );
    } catch (error) {
      await this.prisma.withTenantSchema(params.schemaName, async (tx) => {
        await this.bumpMetric(tx, 'consolidation_run', 'failed', {
          periodKey,
          scopeHash: params.scopeHash,
          branchCount: effectiveBranchIds.length,
          entityId: params.entityId ?? null,
          reason: error instanceof Error ? error.message : String(error),
        });
      });
      throw error;
    }
  }

  async reverseConsolidationRun(params: {
    schemaName: string;
    runId: string;
    actorUserId: string | null;
    reason?: string;
  }): Promise<ConsolidationRunItem> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const run = await this.loadRunOrFail(tx, params.runId);
      if (run.status === 'draft') {
        throw new BadRequestException(
          'Cannot reverse a draft consolidation run',
        );
      }
      if (
        (run.status !== 'posted' && run.status !== 'finalized') ||
        run.reversedAt
      ) {
        throw new BadRequestException('Consolidation run is already reversed');
      }
      await this.reverseRunInTx(
        tx,
        run,
        params.actorUserId,
        params.reason?.trim() || 'manual-reverse',
      );
      return this.loadRunOrFail(tx, params.runId);
    });
  }

  async finalizeConsolidationRun(params: {
    schemaName: string;
    runId: string;
    actorUserId: string | null;
  }): Promise<ConsolidationRunItem> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const run = await this.loadRunOrFail(tx, params.runId);
      if (run.status === 'draft') {
        throw new BadRequestException(
          'Finalize is only allowed for posted runs',
        );
      }
      if (run.status === 'finalized') {
        return run;
      }
      if (run.status !== 'posted' || run.reversedAt) {
        throw new BadRequestException(
          'Only an active posted run can be finalized',
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE consolidation_runs
         SET status = 'finalized',
             finalized_at = CURRENT_TIMESTAMP,
             finalized_by = $2::uuid,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
           AND status = 'posted'
           AND reversed_at IS NULL`,
        params.runId,
        params.actorUserId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO consolidation_run_events (run_id, event_type, actor_user_id, payload)
         VALUES ($1::uuid, 'finalized', $2::uuid, '{}'::jsonb)`,
        params.runId,
        params.actorUserId,
      );
      await this.audit.append(tx, {
        branchId: null,
        actorUserId: params.actorUserId,
        tableName: 'consolidation_runs',
        recordId: params.runId,
        action: 'finalize',
        oldPayload: { status: 'posted' },
        newPayload: { status: 'finalized' },
        entityType: 'consolidation_run',
        entityId: params.runId,
      });
      return this.loadRunOrFail(tx, params.runId);
    });
  }

  async listRuns(params: {
    schemaName: string;
    scopeHash?: string;
    entityId?: string;
    periodKey?: string;
    limit?: number;
  }): Promise<ConsolidationRunItem[]> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          period_key: string;
          as_of_date: string;
          from_date: string;
          to_date: string;
          scope_hash: string;
          scope_branch_ids: unknown;
          entity_id: string | null;
          status: ConsolidationRunStatus;
          created_by: string | null;
          reversed_by: string | null;
          posted_at: Date;
          reversed_at: Date | null;
          finalized_at: Date | null;
          finalized_by: string | null;
          metadata: Record<string, unknown> | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id::text,
                period_key,
                as_of_date::text,
                from_date::text,
                to_date::text,
                scope_hash,
                scope_branch_ids,
                entity_id::text,
                status,
                created_by::text,
                reversed_by::text,
                posted_at,
                reversed_at,
                finalized_at,
                finalized_by::text,
                metadata,
                created_at,
                updated_at
         FROM consolidation_runs
         WHERE ($1::text IS NULL OR scope_hash = $1)
           AND ($2::uuid IS NULL OR entity_id = $2::uuid)
           AND ($3::text IS NULL OR period_key = $3)
         ORDER BY created_at DESC
         LIMIT $4`,
        params.scopeHash?.trim() || null,
        params.entityId?.trim() || null,
        params.periodKey?.trim() || null,
        Math.max(1, Math.min(200, params.limit ?? 50)),
      );
      return rows.map((row) => ({
        id: row.id,
        periodKey: row.period_key,
        asOfDate: row.as_of_date,
        fromDate: row.from_date,
        toDate: row.to_date,
        scopeHash: row.scope_hash,
        scopeBranchIds: Array.isArray(row.scope_branch_ids)
          ? row.scope_branch_ids.map((x) => String(x))
          : [],
        entityId: row.entity_id,
        status: row.status,
        createdBy: row.created_by,
        reversedBy: row.reversed_by,
        postedAt: row.posted_at.toISOString(),
        reversedAt: row.reversed_at ? row.reversed_at.toISOString() : null,
        finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
        finalizedBy: row.finalized_by,
        metadata: row.metadata ?? null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));
    });
  }

  async getRun(params: { schemaName: string; runId: string }): Promise<
    ConsolidationRunItem & {
      events: Array<{
        id: string;
        eventType: string;
        actorUserId: string | null;
        payload: Record<string, unknown> | null;
        createdAt: string;
      }>;
      journalLinks: Array<{
        id: string;
        journalEntryId: string;
        eliminationType: string;
        accountKey: string | null;
        direction: string | null;
        amount: number;
      }>;
      explain: Record<string, unknown>;
    }
  > {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const run = await this.loadRunOrFail(tx, params.runId);
      const [events, links] = await Promise.all([
        tx.$queryRawUnsafe<
          Array<{
            id: string;
            event_type: string;
            actor_user_id: string | null;
            payload: Record<string, unknown> | null;
            created_at: Date;
          }>
        >(
          `SELECT id::text,
                  event_type,
                  actor_user_id::text,
                  payload,
                  created_at
           FROM consolidation_run_events
           WHERE run_id = $1::uuid
           ORDER BY created_at ASC`,
          params.runId,
        ),
        tx.$queryRawUnsafe<
          Array<{
            id: string;
            journal_entry_id: string;
            elimination_type: string;
            account_key: string | null;
            direction: string | null;
            amount: string;
          }>
        >(
          `SELECT id::text,
                  journal_entry_id::text,
                  elimination_type,
                  account_key,
                  direction,
                  amount::text
           FROM consolidation_journal_links
           WHERE run_id = $1::uuid
           ORDER BY created_at ASC`,
          params.runId,
        ),
      ]);
      const journalLinks = links.map((link) => ({
        id: link.id,
        journalEntryId: link.journal_entry_id,
        eliminationType: link.elimination_type,
        accountKey: link.account_key,
        direction: link.direction,
        amount: Number(link.amount),
      }));
      return {
        ...run,
        events: events.map((event) => ({
          id: event.id,
          eventType: event.event_type,
          actorUserId: event.actor_user_id,
          payload: event.payload ?? null,
          createdAt: event.created_at.toISOString(),
        })),
        journalLinks,
        explain: this.buildConsolidationExplain(run, journalLinks),
      };
    });
  }

  private buildConsolidationExplain(
    run: ConsolidationRunItem,
    journalLinks: Array<{
      eliminationType: string;
      accountKey: string | null;
      amount: number;
    }>,
  ): Record<string, unknown> {
    const byType: Record<string, number> = {};
    for (const link of journalLinks) {
      const k = link.eliminationType || 'unknown';
      byType[k] = round2((byType[k] ?? 0) + Math.abs(link.amount));
    }
    return {
      runId: run.id,
      status: run.status,
      periodKey: run.periodKey,
      scopeHash: run.scopeHash,
      storedComputation: run.metadata,
      journalRollupByEliminationType: byType,
      note: 'Amounts roll up absolute posted link amounts for quick inspection; drill to journal entries for GL detail.',
    };
  }

  async getDisclosureNciReport(params: {
    schemaName: string;
    scopeHash: string;
    periodKey?: string;
  }): Promise<Record<string, unknown>> {
    const run = await this.getLatestPostedSummary({
      schemaName: params.schemaName,
      scopeHash: params.scopeHash,
      periodKey: params.periodKey,
    });
    if (!run)
      return { items: [], message: 'No posted or finalized consolidation run' };
    const detail = await this.getRun({
      schemaName: params.schemaName,
      runId: run.runId,
    });
    const nciLinks = detail.journalLinks.filter((l) =>
      ['nci_allocation', 'nci_equity'].includes(l.eliminationType),
    );
    return {
      runId: detail.id,
      status: detail.status,
      periodKey: detail.periodKey,
      ownership: detail.metadata?.ownership,
      nciLines: nciLinks,
      explain: detail.explain,
    };
  }

  async getDisclosureFxReport(params: {
    schemaName: string;
    scopeHash: string;
    periodKey?: string;
  }): Promise<Record<string, unknown>> {
    const run = await this.getLatestPostedSummary({
      schemaName: params.schemaName,
      scopeHash: params.scopeHash,
      periodKey: params.periodKey,
    });
    if (!run)
      return { items: [], message: 'No posted or finalized consolidation run' };
    const detail = await this.getRun({
      schemaName: params.schemaName,
      runId: run.runId,
    });
    const fxLinks = detail.journalLinks.filter((l) =>
      ['cta_translation'].includes(l.eliminationType),
    );
    return {
      runId: detail.id,
      fx: detail.metadata?.fx,
      ctaLines: fxLinks,
      explain: detail.explain,
    };
  }

  async getDisclosureAdjustmentsReport(params: {
    schemaName: string;
    scopeHash: string;
    periodKey?: string;
  }): Promise<Record<string, unknown>> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          title: string;
          status: string;
          lines: unknown;
          applied_run_id: string | null;
        }>
      >(
        `SELECT id::text, title, status, lines, applied_run_id::text
         FROM consolidation_adjustments
         WHERE scope_hash = $1
           AND ($2::text IS NULL OR period_key = $2)
         ORDER BY created_at DESC
         LIMIT 200`,
        params.scopeHash,
        params.periodKey?.trim() || null,
      );
      return {
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          lines: r.lines,
          appliedRunId: r.applied_run_id,
        })),
      };
    });
  }

  async getDisclosureIntercompanyReport(params: {
    schemaName: string;
    scopeHash: string;
    periodKey?: string;
  }): Promise<Record<string, unknown>> {
    const run = await this.getLatestPostedSummary({
      schemaName: params.schemaName,
      scopeHash: params.scopeHash,
      periodKey: params.periodKey,
    });
    if (!run)
      return { items: [], message: 'No posted or finalized consolidation run' };
    const detail = await this.getRun({
      schemaName: params.schemaName,
      runId: run.runId,
    });
    const ic = detail.journalLinks.filter((l) =>
      ['balance_sheet', 'profit_loss'].includes(l.eliminationType),
    );
    return {
      runId: detail.id,
      balances: detail.metadata?.balances,
      pnl: detail.metadata?.pnl,
      eliminationLines: ic,
      explain: detail.explain,
    };
  }

  async getLatestPostedSummary(params: {
    schemaName: string;
    scopeHash: string;
    entityId?: string;
    periodKey?: string;
  }): Promise<{
    runId: string;
    postedAt: string;
    metadata: Record<string, unknown> | null;
  } | null> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          posted_at: Date;
          metadata: Record<string, unknown> | null;
        }>
      >(
        `SELECT id::text, posted_at, metadata
         FROM consolidation_runs
         WHERE scope_hash = $1
           AND ($2::uuid IS NULL OR entity_id = $2::uuid)
           AND reversed_at IS NULL
           AND status IN ('posted', 'finalized')
           AND ($3::text IS NULL OR period_key = $3)
         ORDER BY COALESCE(finalized_at, posted_at) DESC, created_at DESC
         LIMIT 1`,
        params.scopeHash,
        params.entityId?.trim() || null,
        params.periodKey?.trim() || null,
      );
      if (!row) return null;
      return {
        runId: row.id,
        postedAt: row.posted_at.toISOString(),
        metadata: row.metadata ?? null,
      };
    });
  }

  async queryConsolidationPnlAdjustments(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ): Promise<{
    revenue: number;
    cogs: number;
    expenses: number;
  }> {
    if (branchIds.length <= 1) return { revenue: 0, cogs: 0, expenses: 0 };
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<{ account_key: string; amount: string }>
      >(
        `SELECT coa.account_key,
                SUM(
                  CASE
                    WHEN coa.account_type = 'income' THEN jl.debit - jl.credit
                    WHEN coa.account_type = 'expense' THEN jl.credit - jl.debit
                    ELSE 0
                  END
                )::numeric(14,2)::text AS amount
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.source_type = 'consolidation_pnl'
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_key IN ('sales_revenue', 'cogs', 'operating_expense')
         GROUP BY coa.account_key`,
        ...branchParams,
        fromDate,
        toDate,
      );
      const out = { revenue: 0, cogs: 0, expenses: 0 };
      for (const row of rows) {
        const amount = round2(Number(row.amount));
        if (row.account_key === 'sales_revenue') out.revenue += amount;
        else if (row.account_key === 'cogs') out.cogs += amount;
        else if (row.account_key === 'operating_expense')
          out.expenses += amount;
      }
      return out;
    });
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
