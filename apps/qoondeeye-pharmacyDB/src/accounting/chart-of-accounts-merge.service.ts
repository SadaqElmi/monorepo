import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Merge two `chart_of_accounts` rows that incorrectly share the same logical
 * account **within one branch** (same `branch_id` and `account_key`).
 *
 * **Eligibility (SQL for operators):**
 *
 * True merge targets — same branch, same key (should not exist if
 * `UNIQUE(branch_id, account_key)` is enforced):
 *
 * ```sql
 * SELECT branch_id, account_key, COUNT(*) AS n, array_agg(id::text ORDER BY id) AS ids
 * FROM chart_of_accounts
 * GROUP BY branch_id, account_key
 * HAVING COUNT(*) > 1;
 * ```
 *
 * **Not** merge targets — one COA row per branch with the same `account_key`
 * (multi-branch tenants). Detected by grouping only on `account_key`:
 *
 * ```sql
 * SELECT account_key, COUNT(*) FROM chart_of_accounts
 * WHERE account_type IN ('income', 'expense')
 * GROUP BY account_key HAVING COUNT(*) > 1;
 * ```
 *
 * Those rows usually differ by `branch_id`; merging them would break
 * per-branch GL. Use consolidated reporting / summed drill-down instead.
 */
export type CoaMergeAccountRow = {
  id: string;
  branch_id: string;
  account_key: string;
  payment_method_key: string | null;
  parent_id: string | null;
};

export type MergeChartOfAccountsResult = {
  merged: true;
  journalLinesUpdated: number;
  parentLinksUpdated: number;
  snapshotsMergedOrRepointed: number;
  paymentMethodKeyMoved: boolean;
  deletedAccountId: string;
};

export function assertCoaRowsMergeable(
  branchId: string,
  source: CoaMergeAccountRow,
  target: CoaMergeAccountRow,
): void {
  if (source.id === target.id) {
    throw new BadRequestException('sourceAccountId and targetAccountId must differ');
  }
  if (source.branch_id !== branchId || target.branch_id !== branchId) {
    throw new BadRequestException(
      'Both accounts must belong to the branchId provided in the request body',
    );
  }
  if (source.branch_id !== target.branch_id) {
    throw new BadRequestException('Accounts belong to different branches');
  }
  if (source.account_key !== target.account_key) {
    throw new BadRequestException(
      'account_key must match for both rows (merge is for duplicate keys in one branch only)',
    );
  }
  const sk = source.payment_method_key?.trim() || null;
  const tk = target.payment_method_key?.trim() || null;
  if (sk && tk && sk !== tk) {
    throw new BadRequestException(
      'payment_method_key differs between the two rows; align or clear one before merge',
    );
  }
}

@Injectable()
export class ChartOfAccountsMergeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Repoints `journal_lines`, `parent_id`, optional balance snapshots, then deletes `source`.
   * Caller must enforce auth (e.g. admin/owner).
   */
  async mergeDuplicatedAccounts(
    schemaName: string,
    branchId: string,
    sourceAccountId: string,
    targetAccountId: string,
  ): Promise<MergeChartOfAccountsResult> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<CoaMergeAccountRow[]>(
        `SELECT id::text AS id,
                branch_id::text AS branch_id,
                account_key,
                NULLIF(TRIM(payment_method_key), '')::varchar AS payment_method_key,
                parent_id::text AS parent_id
         FROM chart_of_accounts
         WHERE id = ANY($1::uuid[])`,
        [sourceAccountId, targetAccountId],
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      const source = byId.get(sourceAccountId);
      const target = byId.get(targetAccountId);
      if (!source || !target) {
        throw new BadRequestException(
          'One or both account ids were not found in chart_of_accounts',
        );
      }

      assertCoaRowsMergeable(branchId, source, target);

      if (target.parent_id === source.id && source.parent_id === target.id) {
        throw new BadRequestException(
          'These accounts reference each other as parent; reparent one side manually before merge',
        );
      }

      if (target.parent_id === source.id) {
        await tx.$executeRawUnsafe(
          `UPDATE chart_of_accounts
           SET parent_id = $1::uuid
           WHERE id = $2::uuid AND parent_id = $3::uuid`,
          source.parent_id,
          target.id,
          source.id,
        );
      }

      const parentChildren = await tx.$queryRawUnsafe<{ id: string }[]>(
        `UPDATE chart_of_accounts
         SET parent_id = $1::uuid
         WHERE parent_id = $2::uuid AND id <> $1::uuid
         RETURNING id::text AS id`,
        targetAccountId,
        sourceAccountId,
      );

      const jlRows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `UPDATE journal_lines jl
         SET account_id = $1::uuid
         WHERE jl.account_id = $2::uuid
         RETURNING jl.id::text AS id`,
        targetAccountId,
        sourceAccountId,
      );

      let snapshotsMergedOrRepointed = 0;
      const [snapExists] = await tx.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'branch_account_balance_snapshot'
         ) AS exists`,
        schemaName,
      );
      if (snapExists?.exists) {
        snapshotsMergedOrRepointed = await this.mergeBalanceSnapshots(
          tx,
          branchId,
          sourceAccountId,
          targetAccountId,
        );
      }

      let paymentMethodKeyMoved = false;
      const sk = source.payment_method_key?.trim() || null;
      const tk = target.payment_method_key?.trim() || null;
      if (sk && !tk) {
        await tx.$executeRawUnsafe(
          `UPDATE chart_of_accounts
           SET payment_method_key = $1::varchar
           WHERE id = $2::uuid AND payment_method_key IS NULL`,
          sk,
          targetAccountId,
        );
        paymentMethodKeyMoved = true;
      }

      await tx.$executeRawUnsafe(
        `DELETE FROM chart_of_accounts WHERE id = $1::uuid`,
        sourceAccountId,
      );

      return {
        merged: true,
        journalLinesUpdated: jlRows.length,
        parentLinksUpdated: parentChildren.length,
        snapshotsMergedOrRepointed,
        paymentMethodKeyMoved,
        deletedAccountId: sourceAccountId,
      };
    });
  }

  private async mergeBalanceSnapshots(
    tx: Prisma.TransactionClient,
    branchId: string,
    sourceAccountId: string,
    targetAccountId: string,
  ): Promise<number> {
    let touched = 0;
    const sourceRows = await tx.$queryRawUnsafe<
      { id: string; period_start: string; balance: string }[]
    >(
      `SELECT id::text AS id, period_start::text AS period_start, balance::text AS balance
       FROM branch_account_balance_snapshot
       WHERE branch_id = $1::uuid AND account_id = $2::uuid`,
      branchId,
      sourceAccountId,
    );

    for (const row of sourceRows) {
      const pair = await tx.$queryRawUnsafe<{ id: string; balance: string }[]>(
        `SELECT id::text AS id, balance::text AS balance
         FROM branch_account_balance_snapshot
         WHERE branch_id = $1::uuid AND account_id = $2::uuid AND period_start = $3::date`,
        branchId,
        targetAccountId,
        row.period_start,
      );
      const existing = pair[0];
      if (existing) {
        await tx.$executeRawUnsafe(
          `UPDATE branch_account_balance_snapshot
           SET balance = (balance + $1::numeric),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid`,
          row.balance,
          existing.id,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM branch_account_balance_snapshot WHERE id = $1::uuid`,
          row.id,
        );
        touched += 2;
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE branch_account_balance_snapshot
           SET account_id = $1::uuid, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid`,
          targetAccountId,
          row.id,
        );
        touched += 1;
      }
    }
    return touched;
  }
}
