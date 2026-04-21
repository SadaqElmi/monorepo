import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FxRateType = 'closing' | 'average' | 'historical';

export type ConsolidationAdjustmentLine = {
  accountKey: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type ConsolidationAdjustmentRow = {
  id: string;
  title: string;
  lines: ConsolidationAdjustmentLine[];
};

@Injectable()
export class ConsolidationEnterpriseService {
  constructor(private readonly prisma: PrismaService) {}

  private isFlagEnabled(name: string): boolean {
    const raw = (process.env[name] ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  assertPartialOwnershipEnabled(): void {
    if (!this.isFlagEnabled('CONSOLIDATION_PARTIAL_OWNERSHIP_V1')) {
      throw new BadRequestException(
        'Partial ownership is disabled by CONSOLIDATION_PARTIAL_OWNERSHIP_V1',
      );
    }
  }

  assertFxEnabled(): void {
    if (!this.isFlagEnabled('CONSOLIDATION_FX_V1')) {
      throw new BadRequestException(
        'FX translation is disabled by CONSOLIDATION_FX_V1',
      );
    }
  }

  assertAdjustmentsEnabled(): void {
    if (!this.isFlagEnabled('CONSOLIDATION_ADJUSTMENTS_V1')) {
      throw new BadRequestException(
        'Consolidation adjustments are disabled by CONSOLIDATION_ADJUSTMENTS_V1',
      );
    }
  }

  async resolveFxRate(
    tx: Prisma.TransactionClient,
    params: {
      fromCurrency: string;
      toCurrency: string;
      rateType: FxRateType;
      asOfDate: string;
    },
  ): Promise<number> {
    const from = params.fromCurrency.trim().toUpperCase();
    const to = params.toCurrency.trim().toUpperCase();
    if (from === to) return 1;
    const [row] = await tx.$queryRawUnsafe<Array<{ rate: string }>>(
      `SELECT rate::text
       FROM fx_rates
       WHERE from_currency = $1
         AND to_currency = $2
         AND rate_type = $3
         AND as_of_date = $4::date
       LIMIT 1`,
      from,
      to,
      params.rateType,
      params.asOfDate,
    );
    if (!row) {
      throw new BadRequestException(
        `Missing FX rate ${from}/${to} (${params.rateType}) for ${params.asOfDate}`,
      );
    }
    return Number(row.rate);
  }

  async resolveEntityCurrency(
    tx: Prisma.TransactionClient,
    entityId: string,
  ): Promise<string> {
    const [row] = await tx.$queryRawUnsafe<
      Array<{ reporting_currency: string | null }>
    >(
      `SELECT reporting_currency
       FROM entities
       WHERE id = $1::uuid
       LIMIT 1`,
      entityId,
    );
    if (!row?.reporting_currency?.trim()) {
      throw new BadRequestException(
        'Entity reporting currency is not configured',
      );
    }
    return row.reporting_currency.trim().toUpperCase();
  }

  async ensureConsolidationAccount(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      accountKey: string;
      name: string;
      accountType: 'equity' | 'asset' | 'liability' | 'income' | 'expense';
    },
  ): Promise<string> {
    const [found] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text
       FROM chart_of_accounts
       WHERE branch_id = $1::uuid
         AND account_key = $2
       LIMIT 1`,
      params.branchId,
      params.accountKey,
    );
    if (found?.id) return found.id;
    const code = `X-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [created] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO chart_of_accounts (
         branch_id, code, name, account_type, account_key, is_system
       )
       VALUES ($1::uuid, $2, $3, $4, $5, true)
       ON CONFLICT (branch_id, account_key)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id::text`,
      params.branchId,
      code,
      params.name,
      params.accountType,
      params.accountKey,
    );
    return created.id;
  }

  async listApprovedAdjustments(
    schemaName: string,
    params: {
      periodKey: string;
      scopeHash: string;
      entityId?: string;
    },
  ): Promise<ConsolidationAdjustmentRow[]> {
    this.assertAdjustmentsEnabled();
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return this.listApprovedAdjustmentsInTx(tx, params);
    });
  }

  async listApprovedAdjustmentsInTx(
    tx: Prisma.TransactionClient,
    params: {
      periodKey: string;
      scopeHash: string;
      entityId?: string;
    },
  ): Promise<ConsolidationAdjustmentRow[]> {
    const rows = await tx.$queryRawUnsafe<
      Array<{ id: string; title: string; lines: unknown }>
    >(
      `SELECT id::text, title, lines
       FROM consolidation_adjustments
       WHERE period_key = $1
         AND scope_hash = $2
         AND status = 'approved'
         AND applied_run_id IS NULL
         AND ($3::uuid IS NULL OR entity_id = $3::uuid)
       ORDER BY created_at ASC`,
      params.periodKey,
      params.scopeHash,
      params.entityId?.trim() || null,
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      lines: Array.isArray(row.lines)
        ? (row.lines as ConsolidationAdjustmentLine[])
        : [],
    }));
  }
}
