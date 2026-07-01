import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchColumnPredicate } from '../common/branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { applyBalanceSheetConsolidation } from './consolidation-report.util';
import type { BalanceSheetConsolidationMeta } from './consolidation-report.util';
import {
  queryInterbranchMismatches,
  queryInterbranchPairBreakdown,
  queryInterbranchTransferBreakdown,
  type ConsolidationPreviewReport,
  type InterbranchMismatchRow,
} from './interbranch-report.util';
import { computeSnapshotDiff } from './report-snapshot-diff.util';
import { severityInventoryGlMismatch } from '../reconciliation/reconciliation-severity.policy';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import { financialBranchTags } from '../cache/cache-tags';
import { normalizeBranchScope } from '../cache/cache-keys';
import { formatBaseQuantityDisplay } from '../uoms/uom-display.util';
import { UomsService } from '../uoms/uoms.service';

export type ReportStatus = 'CLEAN' | 'WARNING' | 'CRITICAL';

export type IncomeStatementReport = {
  lines: Array<{
    accountType: string;
    accountKey: string;
    name: string;
    amount: number;
    drilldownPath?: string;
    drilldownConsistent?: boolean;
    drilldownDelta?: number;
  }>;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  cogs: number;
  grossProfit: number;
  otherExpenses: number;
  intercompany: {
    revenue: number;
    cogs: number;
    expenses: number;
    netIncomeImpact: number;
  };
  netRevenue: number;
  monthlyBreakdown: Array<{
    month: string;
    revenue: number;
    expenses: number;
    netIncome: number;
  }>;
  generatedAt: string;
  elapsedMs: number;
  drilldownCheck?: {
    checked: boolean;
    mismatches: number;
    isConsistent: boolean;
  };
};

export type BalanceSheetReport = {
  lines: Array<{
    accountType: string;
    accountKey: string;
    accountId?: string;
    code?: string | null;
    name: string;
    balance: number;
    drilldownPath?: string;
    drilldownConsistent?: boolean;
    drilldownDelta?: number;
  }>;
  totals: {
    assets: number;
    liabilities: number;
    equityFromAccounts: number;
    retainedEarningsImplicit: number;
    totalEquity: number;
    liabilitiesAndEquity: number;
  };
  generatedAt: string;
  elapsedMs: number;
  /** Present when `consolidated=true` was used for a multi-branch balance sheet. */
  consolidation?: BalanceSheetConsolidationMeta;
  drilldownCheck?: {
    checked: boolean;
    mismatches: number;
    isConsistent: boolean;
    skipReason?: string;
  };
};

export type CashFlowReport = {
  fromDate: string;
  toDate: string;
  sections: {
    operating: Array<{
      section: 'operating' | 'investing' | 'financing';
      sourceType: string;
      accountKey: string;
      name: string;
      netMovement: number;
    }>;
    investing: Array<{
      section: 'operating' | 'investing' | 'financing';
      sourceType: string;
      accountKey: string;
      name: string;
      netMovement: number;
    }>;
    financing: Array<{
      section: 'operating' | 'investing' | 'financing';
      sourceType: string;
      accountKey: string;
      name: string;
      netMovement: number;
    }>;
  };
  sectionTotals: { operating: number; investing: number; financing: number };
  lines: Array<{
    section: 'operating' | 'investing' | 'financing';
    sourceType: string;
    accountKey: string;
    name: string;
    netMovement: number;
  }>;
  netCashMovement: number;
  generatedAt: string;
  elapsedMs: number;
};

export type StuckTransferRow = {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  status: string | null;
  shippedAt: string | null;
  hoursInTransit: number;
  reasonCode: 'stuck_transfer';
  fixSuggestionCode: 'complete_receive';
  message: string;
};

export type CloseReadinessIssue = {
  code:
    | 'interbranch_timing_in_transit'
    | 'interbranch_journal_total_mismatch'
    | 'interbranch_due_from_to_mismatch'
    | 'inventory_negative_on_hand'
    | 'transfer_missing_ship_journal'
    | 'transfer_missing_receive_journal'
    | 'transfer_accounting_failed';
  severity: 'critical' | 'warning' | 'info';
  blocking: boolean;
  domain: 'interbranch' | 'inventory' | 'transfer_posting';
  message: string;
  metadata?: Record<string, unknown>;
};

export type CloseReadinessReport = {
  asOfDate: string;
  status: ReportStatus;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    blocking: number;
  };
  issues: CloseReadinessIssue[];
};

export type PeriodWorkflowState = 'open' | 'review' | 'approved' | 'closed';

export type PeriodWorkflowRecord = {
  scopeHash: string;
  periodKey: string;
  periodEnd: string;
  state: PeriodWorkflowState;
  preparedBy: string | null;
  preparedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  closedAt: string | null;
};

export type InventoryGlSyncRow = {
  branchId: string;
  inventoryValue: number;
  glValue: number;
  difference: number;
  severity: 'clean' | 'warning' | 'critical';
};

export type AlertItem = {
  code:
    | 'stuck_transfer'
    | 'interbranch_critical_mismatch'
    | 'inventory_negative_on_hand';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Stable id for UI drill-down / explain payloads. */
  explainRef?: string;
};

export type VarianceAnalysisRow = {
  account: string;
  change: number;
  drivers: Array<{
    type: string;
    impact: number;
  }>;
};

export type ExplainNumberResult = {
  account: string;
  value: number;
  asOfDate: string;
  breakdown: Array<{
    type: string;
    amount: number;
  }>;
};

@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);
  /** Redis-backed cache TTL (ms). Default 60s; override with CACHE_DEFAULT_TTL_MS or REPORT_CACHE_TTL_MS. */
  private readonly cacheTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taggedCache: TaggedCacheService,
    private readonly uomsService: UomsService,
  ) {
    const rawDefault = Number(process.env.CACHE_DEFAULT_TTL_MS);
    const rawReport = Number(process.env.REPORT_CACHE_TTL_MS);
    const pick =
      Number.isFinite(rawDefault) && rawDefault > 0
        ? rawDefault
        : Number.isFinite(rawReport) && rawReport > 0
          ? rawReport
          : 60_000;
    this.cacheTtlMs = Math.min(600_000, Math.max(5_000, pick));
  }

  private accountTypeFamily(accountType: string): string {
    if (accountType === 'asset' || accountType.startsWith('asset_')) {
      return 'asset';
    }
    if (
      accountType === 'liability' ||
      accountType.startsWith('liability_')
    ) {
      return 'liability';
    }
    if (accountType === 'cost_of_goods_sold') {
      return 'expense';
    }
    return accountType;
  }

  /** When true, P&amp;L excludes rows on `chart_of_accounts.is_interbranch` (future intercompany P&amp;L). */
  private featureInterbranchPnlExclude(): boolean {
    const v = (process.env.FEATURE_INTERBRANCH_PNL_EXCLUDE ?? '')
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  private cacheKey(
    name: string,
    parts: Array<string | number | boolean | null>,
  ) {
    return `${name}|${parts.map((p) => String(p ?? '')).join('|')}`;
  }

  private async compareDrilldownByAccount(
    tx: Prisma.TransactionClient,
    sql: string,
    params: unknown[],
    reportByAccount: Map<string, number>,
  ) {
    const rows = await tx.$queryRawUnsafe<
      Array<{ account_key: string; value: string }>
    >(sql, ...params);
    const drilldownByAccount = new Map<string, number>();
    for (const row of rows) {
      drilldownByAccount.set(row.account_key, Number(row.value));
    }
    const deltas = new Map<string, number>();
    let mismatches = 0;
    for (const [accountKey, reportValue] of reportByAccount.entries()) {
      const drillValue = drilldownByAccount.get(accountKey) ?? 0;
      const delta =
        Math.round((reportValue - drillValue + Number.EPSILON) * 100) / 100;
      deltas.set(accountKey, delta);
      if (Math.abs(delta) > 0.01) mismatches += 1;
    }
    return { deltas, mismatches, isConsistent: mismatches === 0 };
  }

  async persistDailySnapshot(
    schemaName: string,
    input: {
      reportType: 'balance_sheet' | 'profit_loss' | 'cash_flow';
      scopeHash: string;
      periodKey: string;
      periodStart?: string;
      periodEnd?: string;
      asOfDate?: string;
      reportStatus: ReportStatus;
      isFinal: boolean;
      lockDateUsed?: string | null;
      payload: unknown;
    },
  ): Promise<{
    snapshotId: string;
    version: number;
    snapshotDate: string;
    createdAt: string;
    updatedAt: string;
    snapshotDiff: Record<string, unknown> | null;
  }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const sameDay = await tx.$queryRawUnsafe<Array<{ payload: unknown }>>(
        `SELECT payload
         FROM report_snapshots
         WHERE report_type = $1::varchar
           AND scope_hash = $2::varchar
           AND period_key = $3::varchar
           AND snapshot_date = CURRENT_DATE
         FOR UPDATE`,
        input.reportType,
        input.scopeHash,
        input.periodKey,
      );
      let priorPayload: unknown = sameDay[0]?.payload;
      if (priorPayload === undefined) {
        const priorRows = await tx.$queryRawUnsafe<Array<{ payload: unknown }>>(
          `SELECT payload
           FROM report_snapshots
           WHERE report_type = $1::varchar
             AND scope_hash = $2::varchar
             AND period_key = $3::varchar
             AND snapshot_date < CURRENT_DATE
           ORDER BY snapshot_date DESC
           LIMIT 1`,
          input.reportType,
          input.scopeHash,
          input.periodKey,
        );
        priorPayload = priorRows[0]?.payload;
      }

      const snapshotDiff = computeSnapshotDiff(
        input.reportType,
        priorPayload ?? null,
        input.payload ?? {},
      );

      const [row] = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          version: number;
          snapshot_date: string;
          created_at: string;
          updated_at: string;
          snapshot_diff: unknown;
        }>
      >(
        `INSERT INTO report_snapshots (
           report_type,
           scope_hash,
           period_key,
           snapshot_date,
           period_start,
           period_end,
           as_of_date,
           report_status,
           is_final,
           lock_date_used,
           payload,
           snapshot_diff
         )
         VALUES (
           $1::varchar,
           $2::varchar,
           $3::varchar,
           CURRENT_DATE,
           $4::date,
           $5::date,
           $6::date,
           $7::varchar,
           $8::boolean,
           $9::date,
           $10::jsonb,
           $11::jsonb
         )
         ON CONFLICT (report_type, scope_hash, period_key, snapshot_date)
         DO UPDATE SET
           report_status = EXCLUDED.report_status,
           is_final = EXCLUDED.is_final,
           lock_date_used = EXCLUDED.lock_date_used,
           payload = EXCLUDED.payload,
           snapshot_diff = EXCLUDED.snapshot_diff,
           version = report_snapshots.version + 1,
           updated_at = CURRENT_TIMESTAMP
         RETURNING
           id,
           version,
           snapshot_date::text,
           created_at::text,
           updated_at::text,
           snapshot_diff`,
        input.reportType,
        input.scopeHash,
        input.periodKey,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.asOfDate ?? null,
        input.reportStatus,
        input.isFinal,
        input.lockDateUsed ?? null,
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(snapshotDiff ?? {}),
      );
      if (!row) {
        throw new Error('persistDailySnapshot: insert returned no row');
      }
      const diff =
        row.snapshot_diff &&
        typeof row.snapshot_diff === 'object' &&
        !Array.isArray(row.snapshot_diff)
          ? (row.snapshot_diff as Record<string, unknown>)
          : null;
      return {
        snapshotId: row.id,
        version: Number(row.version ?? 1),
        snapshotDate: row.snapshot_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        snapshotDiff: diff,
      };
    });
  }

  /**
   * Latest stored snapshot for the same report scope/period on a strictly
   * earlier calendar day than today (excludes today's upsert row).
   */
  async getPriorSnapshotBeforeToday(
    schemaName: string,
    input: {
      reportType: 'profit_loss' | 'balance_sheet' | 'cash_flow';
      scopeHash: string;
      periodKey: string;
    },
  ): Promise<{
    id: string;
    snapshotDate: string;
    version: number;
    payload: unknown;
  } | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          snapshot_date: string;
          version: number;
          payload: unknown;
        }>
      >(
        `SELECT id::text AS id,
                snapshot_date::text AS snapshot_date,
                version,
                payload
         FROM report_snapshots
         WHERE report_type = $1::varchar
           AND scope_hash = $2::varchar
           AND period_key = $3::varchar
           AND snapshot_date < CURRENT_DATE
         ORDER BY snapshot_date DESC
         LIMIT 1`,
        input.reportType,
        input.scopeHash,
        input.periodKey,
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        snapshotDate: row.snapshot_date,
        version: Number(row.version ?? 1),
        payload: row.payload,
      };
    });
  }

  async incomeStatement(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
    opts?: { monthlyBreakdown?: boolean; drilldownPath?: string },
  ): Promise<IncomeStatementReport> {
    const excludeInterbranchPnl = this.featureInterbranchPnlExclude();
    const pnlInterbranchSql = excludeInterbranchPnl
      ? ' AND COALESCE(coa.is_interbranch, false) = false '
      : '';
    const cacheKey = this.cacheKey('income', [
      schemaName,
      normalizeBranchScope(branchIds),
      fromDate,
      toDate,
      opts?.monthlyBreakdown ?? false,
      opts?.drilldownPath ?? '',
      excludeInterbranchPnl ? 'ix:1' : 'ix:0',
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        const startedAt = Date.now();
        return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        {
          account_type: string;
          account_key: string;
          name: string;
          amount: string;
        }[]
      >(
        `SELECT coa.account_type,
                coa.account_key,
                coa.name,
                SUM(
                  CASE
                    WHEN coa.account_type = 'income' THEN jl.credit - jl.debit
                    WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN jl.debit - jl.credit
                    ELSE 0
                  END
                )::numeric(14,2)::text AS amount
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_type IN ('income', 'expense', 'cost_of_goods_sold')
           ${pnlInterbranchSql}
         GROUP BY coa.id, coa.account_type, coa.account_key, coa.name
         HAVING SUM(
                  CASE
                    WHEN coa.account_type = 'income' THEN jl.credit - jl.debit
                    WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN jl.debit - jl.credit
                    ELSE 0
                  END
                ) <> 0
         ORDER BY coa.account_type DESC, coa.name`,
        ...branchParams,
        fromDate,
        toDate,
      );
      const intercompanyRows = await tx.$queryRawUnsafe<
        {
          account_type: string;
          account_key: string;
          amount: string;
        }[]
      >(
        `SELECT coa.account_type,
                coa.account_key,
                SUM(
                  CASE
                    WHEN coa.account_type = 'income' THEN jl.credit - jl.debit
                    WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN jl.debit - jl.credit
                    ELSE 0
                  END
                )::numeric(14,2)::text AS amount
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_type IN ('income', 'expense', 'cost_of_goods_sold')
           AND COALESCE(coa.is_interbranch, false) = true
         GROUP BY coa.id, coa.account_type, coa.account_key`,
        ...branchParams,
        fromDate,
        toDate,
      );

      let revenue = 0;
      let expense = 0;
      let cogs = 0;
      let intercompanyRevenue = 0;
      let intercompanyExpenses = 0;
      let intercompanyCogs = 0;
      for (const r of rows) {
        const a = Number(r.amount);
        if (r.account_type === 'income') revenue += a;
        else expense += a;
        if (
          r.account_type === 'cost_of_goods_sold' ||
          (r.account_type === 'expense' && r.account_key === 'cogs')
        ) {
          cogs += a;
        }
      }
      for (const r of intercompanyRows) {
        const amount = Number(r.amount);
        if (r.account_type === 'income') intercompanyRevenue += amount;
        else intercompanyExpenses += amount;
        if (
          r.account_type === 'cost_of_goods_sold' ||
          (r.account_type === 'expense' && r.account_key === 'cogs')
        ) {
          intercompanyCogs += amount;
        }
      }
      const otherExpenses = expense - cogs;
      const grossProfit = revenue - cogs;
      const monthlyBreakdown = opts?.monthlyBreakdown
        ? await tx.$queryRawUnsafe<
            {
              month: string;
              revenue: string;
              expenses: string;
            }[]
          >(
            `SELECT TO_CHAR(DATE_TRUNC('month', je.entry_date), 'YYYY-MM') AS month,
                    SUM(CASE WHEN coa.account_type = 'income' THEN jl.credit - jl.debit ELSE 0 END)::numeric(14,2)::text AS revenue,
                    SUM(CASE WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN jl.debit - jl.credit ELSE 0 END)::numeric(14,2)::text AS expenses
             FROM journal_lines jl
             INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
             INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
             WHERE ${branchWhere}
               AND je.entry_date >= $2::date
               AND je.entry_date <= $3::date
               AND coa.account_type IN ('income', 'expense', 'cost_of_goods_sold')
               ${pnlInterbranchSql}
             GROUP BY DATE_TRUNC('month', je.entry_date)
             ORDER BY DATE_TRUNC('month', je.entry_date)`,
            ...branchParams,
            fromDate,
            toDate,
          )
        : [];
      const payload: IncomeStatementReport = {
        lines: rows.map((r) => ({
          accountType: r.account_type,
          accountKey: r.account_key,
          name: r.name,
          amount: Number(r.amount),
          drilldownPath: opts?.drilldownPath
            ? `${opts.drilldownPath}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&accountKey=${encodeURIComponent(r.account_key)}`
            : undefined,
        })),
        totalRevenue: revenue,
        totalExpenses: expense,
        netIncome: revenue - expense,
        cogs,
        grossProfit,
        otherExpenses,
        intercompany: {
          revenue: intercompanyRevenue,
          cogs: intercompanyCogs,
          expenses: intercompanyExpenses,
          netIncomeImpact: intercompanyRevenue - intercompanyExpenses,
        },
        netRevenue: revenue - intercompanyRevenue,
        monthlyBreakdown: monthlyBreakdown.map((m) => {
          const rev = Number(m.revenue);
          const exp = Number(m.expenses);
          return {
            month: m.month,
            revenue: rev,
            expenses: exp,
            netIncome: rev - exp,
          };
        }),
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      };
      const reportByAccount = new Map<string, number>();
      for (const line of payload.lines) {
        const k = line.accountKey;
        reportByAccount.set(k, (reportByAccount.get(k) ?? 0) + line.amount);
      }
      const consistency = await this.compareDrilldownByAccount(
        tx,
        `SELECT coa.account_key,
                SUM(
                  CASE
                    WHEN coa.account_type = 'income' THEN jl.credit - jl.debit
                    WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN jl.debit - jl.credit
                    ELSE 0
                  END
                )::numeric(14,2)::text AS value
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_type IN ('income', 'expense', 'cost_of_goods_sold')
           ${pnlInterbranchSql}
         GROUP BY coa.account_key`,
        [...branchParams, fromDate, toDate],
        reportByAccount,
      );
      payload.lines = payload.lines.map((line) => {
        const delta = consistency.deltas.get(line.accountKey) ?? 0;
        return {
          ...line,
          drilldownConsistent: Math.abs(delta) < 0.01,
          drilldownDelta: delta,
        };
      });
      payload.drilldownCheck = {
        checked: true,
        mismatches: consistency.mismatches,
        isConsistent: consistency.isConsistent,
      };
      return payload;
        });
      },
    );
  }

  async balanceSheet(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
    opts?: { drilldownPath?: string; consolidated?: boolean },
  ): Promise<BalanceSheetReport> {
    const consolidated = Boolean(opts?.consolidated);
    const cacheKey = this.cacheKey('balance_sheet', [
      schemaName,
      normalizeBranchScope(branchIds),
      asOfDate,
      opts?.drilldownPath ?? '',
      consolidated ? 'c:1' : 'c:0',
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        const startedAt = Date.now();
        return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        {
          account_id: string;
          account_type: string;
          account_key: string;
          code: string | null;
          name: string;
          balance: string;
        }[]
      >(
        `SELECT coa.id AS account_id,
                coa.account_type,
                coa.account_key,
                coa.code,
                coa.name,
                (
                  CASE
                    WHEN coa.account_type = 'asset' OR coa.account_type LIKE 'asset_%' THEN SUM(jl.debit - jl.credit)
                    WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN SUM(jl.debit - jl.credit)
                    WHEN coa.account_type = 'liability' OR coa.account_type LIKE 'liability_%' THEN SUM(jl.credit - jl.debit)
                    WHEN coa.account_type = 'equity' THEN SUM(jl.credit - jl.debit)
                    WHEN coa.account_type = 'income' THEN SUM(jl.credit - jl.debit)
                    ELSE 0
                  END
                )::numeric(14,2)::text AS balance
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
           AND coa.account_type <> 'section'
         GROUP BY coa.id, coa.account_type, coa.account_key, coa.code, coa.name
         HAVING (
           CASE
             WHEN coa.account_type = 'asset' OR coa.account_type LIKE 'asset_%' THEN SUM(jl.debit - jl.credit)
             WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN SUM(jl.debit - jl.credit)
             WHEN coa.account_type = 'liability' OR coa.account_type LIKE 'liability_%' THEN SUM(jl.credit - jl.debit)
             WHEN coa.account_type = 'equity' THEN SUM(jl.credit - jl.debit)
             WHEN coa.account_type = 'income' THEN SUM(jl.credit - jl.debit)
             ELSE 0
           END
         ) <> 0
         ORDER BY coa.code NULLS LAST, coa.name`,
        ...branchParams,
        asOfDate,
      );

      const byType: Record<string, number> = {
        asset: 0,
        liability: 0,
        equity: 0,
        income: 0,
        expense: 0,
      };
      for (const r of rows) {
        const family = this.accountTypeFamily(r.account_type);
        byType[family] = (byType[family] ?? 0) + Number(r.balance);
      }

      const retainedFromPnl = (byType.income ?? 0) - (byType.expense ?? 0);
      const assets = byType.asset ?? 0;
      const liabilities = byType.liability ?? 0;
      const equityAccounts = byType.equity ?? 0;
      const totalEquity = equityAccounts + retainedFromPnl;

      const payload: BalanceSheetReport = {
        lines: rows.map((r) => ({
          accountType: r.account_type,
          accountKey: r.account_key,
          accountId: r.account_id,
          code: r.code,
          name: r.name,
          balance: Number(r.balance),
          drilldownPath: opts?.drilldownPath
            ? `${opts.drilldownPath}?from=1970-01-01&to=${encodeURIComponent(asOfDate)}&accountKey=${encodeURIComponent(r.account_key)}`
            : undefined,
        })),
        totals: {
          assets,
          liabilities,
          equityFromAccounts: equityAccounts,
          retainedEarningsImplicit: retainedFromPnl,
          totalEquity,
          liabilitiesAndEquity: liabilities + totalEquity,
        },
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      };
      const reportByAccount = new Map<string, number>();
      for (const line of payload.lines) {
        const k = line.accountKey;
        reportByAccount.set(k, (reportByAccount.get(k) ?? 0) + line.balance);
      }
      const consistency = await this.compareDrilldownByAccount(
        tx,
        `SELECT coa.account_key,
                (
                  CASE
                    WHEN coa.account_type = 'asset' OR coa.account_type LIKE 'asset_%' THEN SUM(jl.debit - jl.credit)
                    WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN SUM(jl.debit - jl.credit)
                    WHEN coa.account_type = 'liability' OR coa.account_type LIKE 'liability_%' THEN SUM(jl.credit - jl.debit)
                    WHEN coa.account_type = 'equity' THEN SUM(jl.credit - jl.debit)
                    WHEN coa.account_type = 'income' THEN SUM(jl.credit - jl.debit)
                    ELSE 0
                  END
                )::numeric(14,2)::text AS value
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
           AND coa.account_type <> 'section'
         GROUP BY coa.account_key, coa.account_type`,
        [...branchParams, asOfDate],
        reportByAccount,
      );
      payload.lines = payload.lines.map((line) => {
        const delta = consistency.deltas.get(line.accountKey) ?? 0;
        return {
          ...line,
          drilldownConsistent: Math.abs(delta) < 0.01,
          drilldownDelta: delta,
        };
      });
      payload.drilldownCheck = {
        checked: true,
        mismatches: consistency.mismatches,
        isConsistent: consistency.isConsistent,
      };
      let finalPayload: BalanceSheetReport = payload;
      if (consolidated && branchIds.length > 1) {
        const [pairBreakdown, transferBreakdown] = await Promise.all([
          queryInterbranchPairBreakdown(tx, branchIds, asOfDate),
          queryInterbranchTransferBreakdown(tx, branchIds, asOfDate, 50),
        ]);
        finalPayload = applyBalanceSheetConsolidation(payload, {
          interbranchBreakdown: pairBreakdown,
          transferBreakdown,
        });
      }
      return finalPayload;
        });
      },
    );
  }

  /** Read-only: stock transfers with inter-branch / journal issues (scoped branches). */
  async listInterbranchMismatches(
    schemaName: string,
    branchIds: string[],
  ): Promise<InterbranchMismatchRow[]> {
    return this.prisma.withTenantSchema(schemaName, async (tx) =>
      queryInterbranchMismatches(tx, branchIds),
    );
  }

  /** Read-only: shipped transfers older than threshold that were not received. */
  async listStuckTransfers(
    schemaName: string,
    branchIds: string[],
    olderThanHours: number,
  ): Promise<StuckTransferRow[]> {
    if (!branchIds.length) return [];
    const threshold = Math.max(
      1,
      Math.min(24 * 90, Math.floor(olderThanHours)),
    );
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          transfer_id: string;
          from_branch_id: string;
          to_branch_id: string;
          status: string | null;
          shipped_at: Date | null;
          hours_in_transit: string;
        }>
      >(
        `SELECT
           st.id::text AS transfer_id,
           st.from_branch_id::text AS from_branch_id,
           st.to_branch_id::text AS to_branch_id,
           st.status,
           st.shipped_at,
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - st.shipped_at)) / 3600 AS hours_in_transit
         FROM stock_transfers st
         WHERE st.from_branch_id = ANY($1::uuid[])
           AND st.to_branch_id = ANY($1::uuid[])
           AND lower(COALESCE(st.status, '')) = 'shipped'
           AND st.is_reversed = false
           AND st.shipped_at IS NOT NULL
           AND st.receive_journal_entry_id IS NULL
           AND st.shipped_at <= CURRENT_TIMESTAMP - ($2::text || ' hours')::interval
         ORDER BY st.shipped_at ASC`,
        branchIds,
        String(threshold),
      );
      const idSet = new Set<string>();
      for (const row of rows) {
        idSet.add(row.from_branch_id);
        idSet.add(row.to_branch_id);
      }
      const names = await tx.$queryRawUnsafe<
        Array<{ id: string; name: string | null }>
      >(
        `SELECT id::text AS id, name FROM branches WHERE id = ANY($1::uuid[])`,
        [...idSet],
      );
      const nameMap = new Map<string, string>(
        names.map((row) => [row.id, (row.name ?? '').trim() || row.id]),
      );
      return rows.map((row) => {
        const hoursInTransit =
          Math.round(Number(row.hours_in_transit ?? 0) * 10) / 10;
        return {
          transferId: row.transfer_id,
          fromBranchId: row.from_branch_id,
          toBranchId: row.to_branch_id,
          fromBranchName: nameMap.get(row.from_branch_id) ?? row.from_branch_id,
          toBranchName: nameMap.get(row.to_branch_id) ?? row.to_branch_id,
          status: row.status,
          shippedAt: row.shipped_at
            ? new Date(row.shipped_at).toISOString()
            : null,
          hoursInTransit,
          reasonCode: 'stuck_transfer',
          fixSuggestionCode: 'complete_receive',
          message: `Transfer has remained shipped for ${hoursInTransit.toFixed(1)}h without receipt.`,
        };
      });
    });
  }

  async getCloseReadiness(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
  ): Promise<CloseReadinessReport> {
    if (!branchIds.length) {
      return {
        asOfDate,
        status: 'CLEAN',
        summary: { total: 0, critical: 0, warning: 0, info: 0, blocking: 0 },
        issues: [],
      };
    }
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const issues: CloseReadinessIssue[] = [];
      const mismatches = await queryInterbranchMismatches(tx, branchIds);
      for (const row of mismatches) {
        if (row.reasonCode === 'timing_in_transit') {
          issues.push({
            code: 'interbranch_timing_in_transit',
            severity: 'warning',
            blocking: false,
            domain: 'interbranch',
            message: row.message,
            metadata: { transferId: row.transferId, kind: row.kind },
          });
          continue;
        }
        if (row.reasonCode === 'journal_total_mismatch') {
          issues.push({
            code: 'interbranch_journal_total_mismatch',
            severity: 'critical',
            blocking: true,
            domain: 'interbranch',
            message: row.message,
            metadata: { transferId: row.transferId, kind: row.kind },
          });
          continue;
        }
        issues.push({
          code: 'interbranch_due_from_to_mismatch',
          severity: 'critical',
          blocking: true,
          domain: 'interbranch',
          message: row.message,
          metadata: { transferId: row.transferId, kind: row.kind },
        });
      }

      const [negativeInventory] = await tx.$queryRawUnsafe<
        Array<{ c: number }>
      >(
        `SELECT COUNT(*)::int AS c
         FROM inventory i
         WHERE i.branch_id = ANY($1::uuid[])
           AND i.quantity < 0`,
        branchIds,
      );
      if (Number(negativeInventory?.c ?? 0) > 0) {
        issues.push({
          code: 'inventory_negative_on_hand',
          severity: 'critical',
          blocking: true,
          domain: 'inventory',
          message: 'One or more inventory rows have negative on-hand quantity.',
          metadata: { count: Number(negativeInventory?.c ?? 0) },
        });
      }

      const transferRows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          status: string | null;
          ship_accounting_state: string | null;
          receive_accounting_state: string | null;
          shipped_journal_entry_id: string | null;
          receive_journal_entry_id: string | null;
        }>
      >(
        `SELECT
           id::text AS id,
           status,
           ship_accounting_state,
           receive_accounting_state,
           shipped_journal_entry_id::text AS shipped_journal_entry_id,
           receive_journal_entry_id::text AS receive_journal_entry_id
         FROM stock_transfers
         WHERE from_branch_id = ANY($1::uuid[])
           AND to_branch_id = ANY($1::uuid[])
           AND lower(COALESCE(status, '')) IN ('shipped', 'received', 'closed')
           AND is_reversed = false`,
        branchIds,
      );

      let missingShip = 0;
      let missingReceive = 0;
      let postingFailed = 0;
      for (const row of transferRows) {
        const status = (row.status ?? '').toLowerCase();
        if (!row.shipped_journal_entry_id) missingShip += 1;
        if (
          (status === 'received' || status === 'closed') &&
          !row.receive_journal_entry_id
        ) {
          missingReceive += 1;
        }
        if (
          (row.ship_accounting_state ?? '').toLowerCase() === 'failed' ||
          (row.receive_accounting_state ?? '').toLowerCase() === 'failed'
        ) {
          postingFailed += 1;
        }
      }
      if (missingShip > 0) {
        issues.push({
          code: 'transfer_missing_ship_journal',
          severity: 'critical',
          blocking: true,
          domain: 'transfer_posting',
          message:
            'Some shipped/received transfers are missing shipment journals.',
          metadata: { count: missingShip },
        });
      }
      if (missingReceive > 0) {
        issues.push({
          code: 'transfer_missing_receive_journal',
          severity: 'critical',
          blocking: true,
          domain: 'transfer_posting',
          message:
            'Some received/closed transfers are missing receive journals.',
          metadata: { count: missingReceive },
        });
      }
      if (postingFailed > 0) {
        issues.push({
          code: 'transfer_accounting_failed',
          severity: 'critical',
          blocking: true,
          domain: 'transfer_posting',
          message: 'Transfer accounting contains failed posting states.',
          metadata: { count: postingFailed },
        });
      }

      const summary = {
        total: issues.length,
        critical: issues.filter((i) => i.severity === 'critical').length,
        warning: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
        blocking: issues.filter((i) => i.blocking).length,
      };
      const status: ReportStatus =
        summary.critical > 0
          ? 'CRITICAL'
          : summary.warning > 0
            ? 'WARNING'
            : 'CLEAN';

      return { asOfDate, status, summary, issues };
    });
  }

  async approveAccountingPeriod(
    schemaName: string,
    branchIds: string[],
    periodEnd: string,
    actorUserId: string | null,
    scopeHash: string,
  ): Promise<PeriodWorkflowRecord> {
    const readiness = await this.getCloseReadiness(
      schemaName,
      branchIds,
      periodEnd,
    );
    if (readiness.status === 'CRITICAL') {
      throw new BadRequestException(
        'Cannot approve period while close-readiness is CRITICAL',
      );
    }
    const periodKey = periodEnd.trim();
    const closeNow = readiness.status === 'CLEAN';
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO accounting_period_workflow (
           scope_hash, period_key, period_end, state, prepared_by, prepared_at, approved_by, approved_at, closed_at, updated_at
         )
         VALUES ($1, $2, $3::date, $5, $4::uuid, CURRENT_TIMESTAMP, $4::uuid, CURRENT_TIMESTAMP, CASE WHEN $5 = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
         ON CONFLICT (scope_hash, period_key)
         DO UPDATE SET
           state = EXCLUDED.state,
           prepared_by = COALESCE(accounting_period_workflow.prepared_by, EXCLUDED.prepared_by),
           prepared_at = COALESCE(accounting_period_workflow.prepared_at, EXCLUDED.prepared_at),
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at,
           closed_at = EXCLUDED.closed_at,
           updated_at = CURRENT_TIMESTAMP`,
        scopeHash,
        periodKey,
        periodEnd.trim(),
        actorUserId,
        closeNow ? 'closed' : 'approved',
      );
      if (closeNow) {
        await tx.$executeRawUnsafe(
          `UPDATE branches
           SET accounting_lock_date = CASE
             WHEN accounting_lock_date IS NULL OR accounting_lock_date < $2::date
               THEN $2::date
             ELSE accounting_lock_date
           END
           WHERE id = ANY($1::uuid[])`,
          branchIds,
          periodEnd.trim(),
        );
      }
      const [row] = await tx.$queryRawUnsafe<
        Array<{
          scope_hash: string;
          period_key: string;
          period_end: string;
          state: string;
          prepared_by: string | null;
          prepared_at: Date | null;
          approved_by: string | null;
          approved_at: Date | null;
          reopened_by: string | null;
          reopened_at: Date | null;
          closed_at: Date | null;
        }>
      >(
        `SELECT scope_hash, period_key, period_end::text, state,
                prepared_by::text, prepared_at, approved_by::text, approved_at,
                reopened_by::text, reopened_at, closed_at
         FROM accounting_period_workflow
         WHERE scope_hash = $1 AND period_key = $2`,
        scopeHash,
        periodKey,
      );
      return {
        scopeHash: row.scope_hash,
        periodKey: row.period_key,
        periodEnd: row.period_end,
        state: row.state as PeriodWorkflowState,
        preparedBy: row.prepared_by,
        preparedAt: row.prepared_at ? row.prepared_at.toISOString() : null,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
        reopenedBy: row.reopened_by,
        reopenedAt: row.reopened_at ? row.reopened_at.toISOString() : null,
        closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      };
    });
  }

  async reopenAccountingPeriod(
    schemaName: string,
    branchIds: string[],
    periodEnd: string,
    actorUserId: string | null,
    scopeHash: string,
  ): Promise<PeriodWorkflowRecord> {
    const periodKey = periodEnd.trim();
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO accounting_period_workflow (
           scope_hash, period_key, period_end, state, reopened_by, reopened_at, updated_at
         )
         VALUES ($1, $2, $3::date, 'review', $4::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (scope_hash, period_key)
         DO UPDATE SET
           state = 'review',
           reopened_by = EXCLUDED.reopened_by,
           reopened_at = EXCLUDED.reopened_at,
           updated_at = CURRENT_TIMESTAMP`,
        scopeHash,
        periodKey,
        periodEnd.trim(),
        actorUserId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE branches
         SET accounting_lock_date = ($2::date - INTERVAL '1 day')::date
         WHERE id = ANY($1::uuid[])
           AND accounting_lock_date >= $2::date`,
        branchIds,
        periodEnd.trim(),
      );
      const [row] = await tx.$queryRawUnsafe<
        Array<{
          scope_hash: string;
          period_key: string;
          period_end: string;
          state: string;
          prepared_by: string | null;
          prepared_at: Date | null;
          approved_by: string | null;
          approved_at: Date | null;
          reopened_by: string | null;
          reopened_at: Date | null;
          closed_at: Date | null;
        }>
      >(
        `SELECT scope_hash, period_key, period_end::text, state,
                prepared_by::text, prepared_at, approved_by::text, approved_at,
                reopened_by::text, reopened_at, closed_at
         FROM accounting_period_workflow
         WHERE scope_hash = $1 AND period_key = $2`,
        scopeHash,
        periodKey,
      );
      return {
        scopeHash: row.scope_hash,
        periodKey: row.period_key,
        periodEnd: row.period_end,
        state: row.state as PeriodWorkflowState,
        preparedBy: row.prepared_by,
        preparedAt: row.prepared_at ? row.prepared_at.toISOString() : null,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
        reopenedBy: row.reopened_by,
        reopenedAt: row.reopened_at ? row.reopened_at.toISOString() : null,
        closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      };
    });
  }

  async inventoryGlSync(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
  ): Promise<InventoryGlSyncRow[]> {
    if (!branchIds.length) return [];
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const branches = await tx.$queryRawUnsafe<
        Array<{ id: string; name: string | null }>
      >(
        `SELECT id::text AS id, name
         FROM branches
         WHERE id = ANY($1::uuid[])`,
        branchIds,
      );
      const rows: InventoryGlSyncRow[] = [];
      for (const branch of branches) {
        const valuation = await this.inventoryValuation(schemaName, [
          branch.id,
        ]);
        const [gl] = await tx.$queryRawUnsafe<Array<{ value: string }>>(
          `SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric(14,2)::text AS value
           FROM journal_lines jl
           INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
           INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
           WHERE je.branch_id = $1::uuid
             AND je.entry_date <= $2::date
             AND coa.account_key = 'inventory'`,
          branch.id,
          asOfDate,
        );
        const inventoryValue = valuation.totalValue;
        const glValue = Number(gl?.value ?? 0);
        const difference =
          Math.round((inventoryValue - glValue + Number.EPSILON) * 100) / 100;
        const abs = Math.abs(difference);
        rows.push({
          branchId: branch.id,
          inventoryValue,
          glValue,
          difference,
          severity:
            abs >= 1000
              ? 'critical'
              : abs >= 100
                ? (severityInventoryGlMismatch() as 'warning')
                : 'clean',
        });
      }
      return rows;
    });
  }

  async getAlerts(
    schemaName: string,
    branchIds: string[],
  ): Promise<AlertItem[]> {
    const [stuck, mismatches, readiness] = await Promise.all([
      this.listStuckTransfers(
        schemaName,
        branchIds,
        Number(process.env.TRANSFER_STUCK_HOURS ?? 24),
      ),
      this.listInterbranchMismatches(schemaName, branchIds),
      this.getCloseReadiness(
        schemaName,
        branchIds,
        new Date().toISOString().slice(0, 10),
      ),
    ]);
    const alerts: AlertItem[] = [];
    for (const row of stuck.slice(0, 10)) {
      alerts.push({
        code: 'stuck_transfer',
        severity: 'warning',
        title: 'Transfer stuck in shipped state',
        message: row.message,
        metadata: {
          transferId: row.transferId,
          hoursInTransit: row.hoursInTransit,
        },
        explainRef: `alert:stuck_transfer:${row.transferId}`,
      });
    }
    const criticalMismatchCount = mismatches.filter(
      (m) => m.kind !== 'in_transit',
    ).length;
    if (criticalMismatchCount > 0) {
      alerts.push({
        code: 'interbranch_critical_mismatch',
        severity: 'critical',
        title: 'Critical inter-branch mismatches detected',
        message: `${criticalMismatchCount} critical inter-branch mismatch(es) require attention.`,
        metadata: { count: criticalMismatchCount },
        explainRef: 'alert:interbranch_critical_mismatch',
      });
    }
    const negative = readiness.issues.find(
      (i) => i.code === 'inventory_negative_on_hand',
    );
    if (negative) {
      alerts.push({
        code: 'inventory_negative_on_hand',
        severity: 'critical',
        title: 'Negative inventory detected',
        message: negative.message,
        metadata: negative.metadata,
        explainRef: 'alert:inventory_negative_on_hand',
      });
    }
    return alerts;
  }

  async varianceAnalysis(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
    accountKey: string,
  ): Promise<VarianceAnalysisRow[]> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<{ source_type: string; impact: string }>
      >(
        `SELECT je.source_type,
                SUM(jl.debit - jl.credit)::numeric(14,2)::text AS impact
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_key = $4
         GROUP BY je.source_type
         ORDER BY ABS(SUM(jl.debit - jl.credit)) DESC`,
        ...branchParams,
        fromDate,
        toDate,
        accountKey,
      );
      const drivers = rows.map((row) => ({
        type: row.source_type,
        impact: Number(row.impact),
      }));
      const change =
        Math.round(
          (drivers.reduce((sum, row) => sum + row.impact, 0) + Number.EPSILON) *
            100,
        ) / 100;
      return [
        {
          account: accountKey,
          change,
          drivers,
        },
      ];
    });
  }

  async explainNumber(
    schemaName: string,
    branchIds: string[],
    accountKey: string,
    asOfDate: string,
  ): Promise<ExplainNumberResult> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<{ source_type: string; amount: string }>
      >(
        `SELECT je.source_type,
                SUM(jl.debit - jl.credit)::numeric(14,2)::text AS amount
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
           AND coa.account_key = $3
         GROUP BY je.source_type
         ORDER BY ABS(SUM(jl.debit - jl.credit)) DESC`,
        ...branchParams,
        asOfDate,
        accountKey,
      );
      const breakdown = rows.map((row) => ({
        type: row.source_type || 'unknown',
        amount: Number(row.amount),
      }));
      const value =
        Math.round(
          (breakdown.reduce((sum, item) => sum + item.amount, 0) +
            Number.EPSILON) *
            100,
        ) / 100;
      return {
        account: accountKey,
        value,
        asOfDate,
        breakdown,
      };
    });
  }

  /** Non-posted elimination preview for operators (reporting-only). */
  async consolidationPreview(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
  ): Promise<ConsolidationPreviewReport> {
    if (branchIds.length <= 1) {
      throw new BadRequestException(
        'consolidation preview requires multiple branches in scope',
      );
    }
    const raw = await this.balanceSheet(schemaName, branchIds, asOfDate, {
      consolidated: false,
    });
    let grossDueFrom = 0;
    let grossDueTo = 0;
    for (const line of raw.lines) {
      if (line.accountKey === 'due_from_branch') grossDueFrom += line.balance;
      if (line.accountKey === 'due_to_branch') grossDueTo += line.balance;
    }
    const residual = Math.round((grossDueFrom - grossDueTo + 1e-9) * 100) / 100;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [interbranchBreakdown, transferBreakdown] = await Promise.all([
        queryInterbranchPairBreakdown(tx, branchIds, asOfDate),
        queryInterbranchTransferBreakdown(tx, branchIds, asOfDate, 50),
      ]);
      const proposedLines =
        Math.abs(residual) <= 0.01
          ? []
          : residual > 0
            ? [
                {
                  accountKey: 'due_to_branch',
                  branchLabel: 'group',
                  debit: residual,
                  credit: 0,
                  memo: 'Preview only — not posted (Dr due to / Cr due from would offset excess receivable)',
                },
                {
                  accountKey: 'due_from_branch',
                  branchLabel: 'group',
                  debit: 0,
                  credit: residual,
                  memo: 'Preview only — not posted',
                },
              ]
            : [
                {
                  accountKey: 'due_from_branch',
                  branchLabel: 'group',
                  debit: -residual,
                  credit: 0,
                  memo: 'Preview only — not posted (Dr due from / Cr due to would offset excess payable)',
                },
                {
                  accountKey: 'due_to_branch',
                  branchLabel: 'group',
                  debit: 0,
                  credit: -residual,
                  memo: 'Preview only — not posted',
                },
              ];
      const tMismatch = transferBreakdown.length;
      const pCount = interbranchBreakdown.length;
      const suggestedAction =
        Math.abs(residual) <= 0.01
          ? 'No reporting-only elimination lines are needed: due from and due to net to zero for this scope and date.'
          : residual > 0
            ? `If you were to post an elimination (not supported here), you would net with Dr due_to_branch / Cr due_from_branch for ${residual.toFixed(2)}. Review ${pCount} branch pair(s) and ${tMismatch} transfer-level variance(s) below for root cause.`
            : `If you were to post an elimination (not supported here), you would net with Dr due_from_branch / Cr due_to_branch for ${Math.abs(residual).toFixed(2)}. Review ${pCount} branch pair(s) and ${tMismatch} transfer-level variance(s) below for root cause.`;
      return {
        reportingMode: 'reporting-only',
        asOfDate,
        residual,
        proposedLines,
        interbranchBreakdown,
        transferBreakdown,
        suggestedAction,
        suggestedSummary: {
          headline:
            Math.abs(residual) <= 0.01
              ? 'Inter-branch balances offset within tolerance.'
              : `Residual ${residual.toFixed(2)} — investigate before relying on consolidated totals.`,
          pairCount: pCount,
          transferMismatchCount: tMismatch,
        },
      };
    });
  }

  async trialBalance(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        { account_key: string; name: string; debit: string; credit: string }[]
      >(
        `SELECT coa.account_key,
                coa.name,
                SUM(jl.debit)::numeric(14,2)::text AS debit,
                SUM(jl.credit)::numeric(14,2)::text AS credit
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
           AND coa.account_type <> 'section'
         GROUP BY coa.id, coa.account_key, coa.name
         ORDER BY coa.name`,
        ...branchParams,
        asOfDate,
      );
      return rows.map((r) => ({
        accountKey: r.account_key,
        name: r.name,
        debit: Number(r.debit),
        credit: Number(r.credit),
      }));
    });
  }

  /** Operational KPI: sales totals for today/yesterday (server calendar date). */
  async todaySalesSummary(schemaName: string, branchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'branch_id',
        branchIds,
        1,
      );
      const [row] = await tx.$queryRawUnsafe<
        {
          today_total: string | number;
          today_count: bigint;
          yesterday_total: string | number;
        }[]
      >(
        `SELECT
           COALESCE(SUM(CASE WHEN CAST(sale_date AS date) = CURRENT_DATE THEN total_amount ELSE 0 END), 0)::numeric AS today_total,
           COUNT(*) FILTER (WHERE CAST(sale_date AS date) = CURRENT_DATE)::bigint AS today_count,
           COALESCE(SUM(CASE WHEN CAST(sale_date AS date) = CURRENT_DATE - INTERVAL '1 day' THEN total_amount ELSE 0 END), 0)::numeric AS yesterday_total
         FROM sales
         WHERE ${branchWhere}`,
        ...branchParams,
      );
      return {
        todayTotal: Number(row?.today_total ?? 0),
        todayCount: Number(row?.today_count ?? 0),
        yesterdayTotal: Number(row?.yesterday_total ?? 0),
      };
    });
  }

  async dashboardSeries(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ) {
    const cacheKey = this.cacheKey('dashboard_series', [
      schemaName,
      normalizeBranchScope(branchIds),
      fromDate,
      toDate,
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        return this.prisma.withTenantSchema(schemaName, async (tx) => {
          const { sql: branchWhere, branchParams } = branchColumnPredicate(
            'je.branch_id',
            branchIds,
            1,
          );
          const daily = await tx.$queryRawUnsafe<
            { d: string; sales: string; expenses: string }[]
          >(
            `WITH days AS (
           SELECT je.entry_date AS d,
                  SUM(CASE WHEN coa.account_key = 'sales_revenue' THEN jl.credit - jl.debit ELSE 0 END)::numeric(14,2) AS sales,
                  SUM(CASE WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN jl.debit - jl.credit ELSE 0 END)::numeric(14,2) AS expenses
           FROM journal_lines jl
           INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
           INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
           WHERE ${branchWhere}
             AND je.entry_date >= $2::date
             AND je.entry_date <= $3::date
           GROUP BY je.entry_date
           ORDER BY je.entry_date
         )
         SELECT d::text, sales::text, expenses::text FROM days`,
            ...branchParams,
            fromDate,
            toDate,
          );
          return daily.map((row) => {
            const sales = Number(row.sales);
            const expenses = Number(row.expenses);
            return {
              date: row.d,
              sales,
              expenses,
              profit: sales - expenses,
            };
          });
        });
      },
    );
  }

  /**
   * Stock value at weighted-average batch cost per product (matches COGS batch logic).
   */
  async inventoryValuation(schemaName: string, branchIds: string[]) {
    const rows = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: batchBranchWhere, branchParams } = branchColumnPredicate(
        'b.branch_id',
        branchIds,
        1,
      );
      const { sql: invBranchWhere } = branchColumnPredicate(
        'i.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        {
          product_id: string;
          product_name: string | null;
          qty: string;
          unit_cost: string;
          line_value: string;
        }[]
      >(
        `WITH batch_agg AS (
           SELECT b.product_id,
                  SUM(GREATEST(b.quantity, 0))::numeric AS batch_qty,
                  SUM(CASE WHEN b.quantity > 0 THEN b.quantity * b.cost_price ELSE 0 END)::numeric AS cost_sum
           FROM batches b
           WHERE ${batchBranchWhere}
           GROUP BY b.product_id
         ),
         inv_qty AS (
           SELECT i.product_id, SUM(i.quantity)::numeric AS quantity
           FROM inventory i
           WHERE ${invBranchWhere}
           GROUP BY i.product_id
         )
         SELECT p.id AS product_id,
                p.name AS product_name,
                i.quantity::text AS qty,
                CASE
                  WHEN COALESCE(ba.batch_qty, 0) > 0
                  THEN (ba.cost_sum / ba.batch_qty)::numeric(14, 4)::text
                  ELSE '0'::text
                END AS unit_cost,
                CASE
                  WHEN COALESCE(ba.batch_qty, 0) > 0
                  THEN (i.quantity * (ba.cost_sum / ba.batch_qty))::numeric(14, 2)::text
                  ELSE '0'::text
                END AS line_value
         FROM inv_qty i
         INNER JOIN products p ON p.id = i.product_id
         LEFT JOIN batch_agg ba ON ba.product_id = i.product_id
         WHERE i.quantity > 0
         ORDER BY p.name`,
        ...branchParams,
      );
      return rows;
    });
    const byProduct = await this.uomsService.listProductUomsForProducts(
      schemaName,
      rows.map((r) => r.product_id),
    );

    let totalValue = 0;
    const lines = rows.map((r) => {
      const lv = Number(r.line_value);
      totalValue += lv;
      const uoms = byProduct[r.product_id] ?? [];
      const base = uoms.find((u) => u.isBase);
      return {
        productId: r.product_id,
        productName: r.product_name,
        qty: Number(r.qty),
        baseUomCode: base?.code ?? null,
        baseUomSymbol: base?.symbol ?? null,
        convertedQuantity: formatBaseQuantityDisplay(Number(r.qty), uoms),
        unitCost: Number(r.unit_cost),
        lineValue: lv,
      };
    });

    return {
      lines,
      totalValue: Math.round((totalValue + Number.EPSILON) * 100) / 100,
    };
  }

  /**
   * Top products by revenue or quantity sold in the date range (operational / sale_lines).
   */
  async topProducts(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
    limit: number,
    sort: 'revenue' | 'quantity',
  ) {
    const take = Math.min(50, Math.max(1, limit));
    const orderSql =
      sort === 'quantity'
        ? `quantity_sold DESC NULLS LAST, revenue DESC NULLS LAST`
        : `revenue DESC NULLS LAST, quantity_sold DESC NULLS LAST`;

    const cacheKey = this.cacheKey('top_products', [
      schemaName,
      normalizeBranchScope(branchIds),
      fromDate,
      toDate,
      take,
      sort,
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        return this.prisma.withTenantSchema(schemaName, async (tx) => {
          const { sql: branchWhere, branchParams } = branchColumnPredicate(
            'si.branch_id',
            branchIds,
            1,
          );
          const rows = await tx.$queryRawUnsafe<
            {
              product_id: string;
              product_name: string | null;
              quantity_sold: string;
              revenue: string;
            }[]
          >(
            `SELECT si.product_id,
                p.name AS product_name,
                SUM(si.quantity)::text AS quantity_sold,
                SUM(COALESCE(si.total, 0))::numeric(14,2)::text AS revenue
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE ${branchWhere}
           AND CAST(s.sale_date AS date) >= $2::date
           AND CAST(s.sale_date AS date) <= $3::date
         GROUP BY si.product_id, p.name
         ORDER BY ${orderSql}
         LIMIT $4`,
            ...branchParams,
            fromDate,
            toDate,
            take,
          );

          return {
            sort,
            fromDate,
            toDate,
            lines: rows.map((r) => ({
              productId: r.product_id,
              productName: r.product_name,
              quantitySold: Number(r.quantity_sold),
              revenue: Number(r.revenue),
            })),
          };
        });
      },
    );
  }

  /**
   * Trial-balance style check: total debits must equal total credits on all posted lines.
   */
  async journalAudit(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const [tot] = await tx.$queryRawUnsafe<
        { debits: string; credits: string }[]
      >(
        `SELECT COALESCE(SUM(jl.debit), 0)::numeric(14,2)::text AS debits,
                COALESCE(SUM(jl.credit), 0)::numeric(14,2)::text AS credits
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date`,
        ...branchParams,
        asOfDate,
      );
      const debits = Number(tot?.debits ?? 0);
      const credits = Number(tot?.credits ?? 0);
      const diff = Math.round((debits - credits + Number.EPSILON) * 100) / 100;

      const bad = await tx.$queryRawUnsafe<{ id: string; imbalance: string }[]>(
        `SELECT je.id,
                (SUM(jl.debit) - SUM(jl.credit))::numeric(14,4)::text AS imbalance
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
         GROUP BY je.id
         HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.005
         LIMIT 50`,
        ...branchParams,
        asOfDate,
      );

      return {
        asOfDate,
        totalDebits: debits,
        totalCredits: credits,
        difference: diff,
        isBalanced: Math.abs(diff) < 0.01,
        unbalancedEntryIds: bad.map((b) => b.id),
      };
    });
  }

  /** Direct-method cash flow with section classification. */
  async cashFlowStatement(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ): Promise<CashFlowReport> {
    const cacheKey = this.cacheKey('cash_flow', [
      schemaName,
      normalizeBranchScope(branchIds),
      fromDate,
      toDate,
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        const startedAt = Date.now();
        return this.prisma.withTenantSchema(schemaName, async (tx) => {
          const { sql: branchWhere, branchParams } = branchColumnPredicate(
            'je.branch_id',
            branchIds,
            1,
          );
          const rows = await tx.$queryRawUnsafe<
            {
              source_type: string;
              account_key: string;
              name: string;
              net_cash: string;
            }[]
          >(
            `SELECT je.source_type,
                coa.account_key,
                coa.name,
                SUM(jl.debit - jl.credit)::numeric(14,2)::text AS net_cash
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_key IN ('cash', 'bank', 'card_clearing')
         GROUP BY je.source_type, coa.id, coa.account_key, coa.name
         ORDER BY je.source_type, coa.account_key`,
            ...branchParams,
            fromDate,
            toDate,
          );
          const sourceToSection = (sourceType: string) => {
            const t = sourceType.toLowerCase().trim();
            if (
              t.includes('purchase_asset') ||
              t.includes('asset') ||
              t.includes('equipment')
            ) {
              return 'investing' as const;
            }
            if (
              t.includes('loan') ||
              t.includes('capital') ||
              t.includes('equity') ||
              t.includes('financing')
            ) {
              return 'financing' as const;
            }
            return 'operating' as const;
          };
          const lines = rows.map((r) => ({
            section: sourceToSection(r.source_type),
            sourceType: r.source_type,
            accountKey: r.account_key,
            name: r.name,
            netMovement: Number(r.net_cash),
          }));
          const bySection = {
            operating: [] as typeof lines,
            investing: [] as typeof lines,
            financing: [] as typeof lines,
          };
          for (const line of lines) bySection[line.section].push(line);

          const total = (items: Array<{ netMovement: number }>) =>
            Math.round(
              (items.reduce((s, item) => s + item.netMovement, 0) +
                Number.EPSILON) *
                100,
            ) / 100;
          const sectionTotals = {
            operating: total(bySection.operating),
            investing: total(bySection.investing),
            financing: total(bySection.financing),
          };
          const payload = {
            fromDate,
            toDate,
            sections: {
              operating: bySection.operating,
              investing: bySection.investing,
              financing: bySection.financing,
            },
            sectionTotals,
            lines,
            netCashMovement:
              sectionTotals.operating +
              sectionTotals.investing +
              sectionTotals.financing,
            generatedAt: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
          };
          return payload;
        });
      },
    );
  }

  async partnerLedger(
    schemaName: string,
    branchIds: string[],
    partnerKind: 'customer' | 'supplier',
    partnerId: string,
    fromDate: string,
    toDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        {
          entry_date: string;
          source_type: string;
          description: string | null;
          account_key: string | null;
          debit: string;
          credit: string;
        }[]
      >(
        `SELECT je.entry_date::text,
                je.source_type,
                je.description,
                coa.account_key,
                jl.debit::text,
                jl.credit::text
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND jl.partner_kind = $2
           AND jl.partner_id = $3::uuid
           AND je.entry_date >= $4::date
           AND je.entry_date <= $5::date
         ORDER BY je.entry_date, je.created_at, jl.id`,
        ...branchParams,
        partnerKind,
        partnerId,
        fromDate,
        toDate,
      );
      let balance = 0;
      const lines = rows.map((r) => {
        const d = Number(r.debit);
        const c = Number(r.credit);
        balance += d - c;
        return {
          entryDate: r.entry_date,
          sourceType: r.source_type,
          description: r.description,
          accountKey: r.account_key,
          debit: d,
          credit: c,
          runningBalance: Math.round((balance + Number.EPSILON) * 100) / 100,
        };
      });
      return { partnerKind, partnerId, fromDate, toDate, lines };
    });
  }

  async agedReceivable(
    schemaName: string,
    branchIds: string[],
    asOfDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        {
          partner_id: string;
          partner_name: string | null;
          balance: string;
        }[]
      >(
        `SELECT jl.partner_id::text,
                c.name AS partner_name,
                SUM(jl.debit - jl.credit)::numeric(14,2)::text AS balance
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         LEFT JOIN customers c ON c.id = jl.partner_id AND jl.partner_kind = 'customer'
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
           AND coa.account_key = 'accounts_receivable'
           AND jl.partner_kind = 'customer'
           AND jl.partner_id IS NOT NULL
         GROUP BY jl.partner_id, c.name
         HAVING SUM(jl.debit - jl.credit) <> 0
         ORDER BY partner_name NULLS LAST`,
        ...branchParams,
        asOfDate,
      );
      return {
        asOfDate,
        lines: rows.map((r) => ({
          customerId: r.partner_id,
          customerName: r.partner_name,
          balance: Number(r.balance),
        })),
      };
    });
  }

  async agedPayable(schemaName: string, branchIds: string[], asOfDate: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        {
          partner_id: string;
          partner_name: string | null;
          balance: string;
        }[]
      >(
        `SELECT jl.partner_id::text,
                s.name AS partner_name,
                SUM(jl.credit - jl.debit)::numeric(14,2)::text AS balance
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         LEFT JOIN suppliers s ON s.id = jl.partner_id AND jl.partner_kind = 'supplier'
         WHERE ${branchWhere}
           AND je.entry_date <= $2::date
           AND coa.account_key = 'accounts_payable'
           AND jl.partner_kind = 'supplier'
           AND jl.partner_id IS NOT NULL
         GROUP BY jl.partner_id, s.name
         HAVING SUM(jl.credit - jl.debit) <> 0
         ORDER BY partner_name NULLS LAST`,
        ...branchParams,
        asOfDate,
      );
      return {
        asOfDate,
        lines: rows.map((r) => ({
          supplierId: r.partner_id,
          supplierName: r.partner_name,
          balance: Number(r.balance),
        })),
      };
    });
  }

  /** Sums journal lines on accounts whose key contains "tax" (basic fiscal view). */
  async taxReport(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        { account_key: string; name: string; amount: string }[]
      >(
        `SELECT coa.account_key,
                coa.name,
                SUM(jl.debit - jl.credit)::numeric(14,2)::text AS amount
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND coa.account_type IN ('expense', 'cost_of_goods_sold')
           AND (coa.account_key ILIKE '%tax%' OR coa.name ILIKE '%tax%')
         GROUP BY coa.id, coa.account_key, coa.name
         HAVING SUM(jl.debit - jl.credit) <> 0
         ORDER BY coa.name`,
        ...branchParams,
        fromDate,
        toDate,
      );
      return {
        fromDate,
        toDate,
        lines: rows.map((r) => ({
          accountKey: r.account_key,
          name: r.name,
          amount: Number(r.amount),
        })),
      };
    });
  }

  async fiscalReport(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ) {
    const cacheKey = this.cacheKey('fiscal_report', [
      schemaName,
      normalizeBranchScope(branchIds),
      fromDate,
      toDate,
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        const pnl = await this.incomeStatement(
          schemaName,
          branchIds,
          fromDate,
          toDate,
        );
        const bs = await this.balanceSheet(schemaName, branchIds, toDate);
        return {
          fromDate,
          toDate,
          netIncome: pnl.netIncome,
          totalAssets: bs.totals.assets,
          totalLiabilities: bs.totals.liabilities,
          totalEquity: bs.totals.totalEquity,
        };
      },
    );
  }

  async executiveSummary(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ) {
    const cacheKey = this.cacheKey('executive_summary', [
      schemaName,
      normalizeBranchScope(branchIds),
      fromDate,
      toDate,
    ]);
    const tags = financialBranchTags(schemaName, branchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.cacheTtlMs,
      async () => {
        const pnl = await this.incomeStatement(
          schemaName,
          branchIds,
          fromDate,
          toDate,
        );
        const series = await this.dashboardSeries(
          schemaName,
          branchIds,
          fromDate,
          toDate,
        );
        const ar = await this.agedReceivable(schemaName, branchIds, toDate);
        const ap = await this.agedPayable(schemaName, branchIds, toDate);
        const arTotal = ar.lines.reduce((s, l) => s + Math.max(0, l.balance), 0);
        const apTotal = ap.lines.reduce((s, l) => s + Math.max(0, l.balance), 0);
        return {
          fromDate,
          toDate,
          revenue: pnl.totalRevenue,
          netIncome: pnl.netIncome,
          grossProfit: pnl.grossProfit,
          outstandingReceivables:
            Math.round((arTotal + Number.EPSILON) * 100) / 100,
          outstandingPayables:
            Math.round((apTotal + Number.EPSILON) * 100) / 100,
          dailyProfitPoints: series.length,
        };
      },
    );
  }

  async invoiceAnalysis(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        { source_type: string; count: string; revenue: string }[]
      >(
        `SELECT je.source_type,
                COUNT(DISTINCT je.id)::text AS count,
                SUM(
                  CASE WHEN coa.account_key = 'sales_revenue'
                  THEN jl.credit - jl.debit ELSE 0 END
                )::numeric(14,2)::text AS revenue
         FROM journal_entries je
         INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND je.source_type IN ('sale', 'customer_invoice')
         GROUP BY je.source_type`,
        ...branchParams,
        fromDate,
        toDate,
      );
      return {
        fromDate,
        toDate,
        lines: rows.map((r) => ({
          sourceType: r.source_type,
          entryCount: Number(r.count),
          revenue: Number(r.revenue),
        })),
      };
    });
  }

  async analyticReport(
    schemaName: string,
    branchIds: string[],
    fromDate: string,
    toDate: string,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { sql: branchWhere, branchParams } = branchColumnPredicate(
        'je.branch_id',
        branchIds,
        1,
      );
      const rows = await tx.$queryRawUnsafe<
        { source_type: string; entry_count: string }[]
      >(
        `SELECT je.source_type,
                COUNT(*)::text AS entry_count
         FROM journal_entries je
         WHERE ${branchWhere}
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
         GROUP BY je.source_type
         ORDER BY entry_count DESC`,
        ...branchParams,
        fromDate,
        toDate,
      );
      return {
        fromDate,
        toDate,
        bySourceType: rows.map((r) => ({
          sourceType: r.source_type,
          entryCount: Number(r.entry_count),
        })),
      };
    });
  }
}
