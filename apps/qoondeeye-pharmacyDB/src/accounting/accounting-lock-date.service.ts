import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Allowed to post on or before branch lock date (strict period close). */
export const ADJUSTMENT_SOURCE_TYPES = new Set<string>([
  'period_adjustment',
  'consolidation_bs',
  'consolidation_pnl',
  'consolidation_reversal',
]);

@Injectable()
export class AccountingLockDateService {
  private toDateString(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    return s ? s.slice(0, 10) : null;
  }

  /**
   * Returns the latest date that is fully locked across all provided branches.
   * If any branch has no lock date, result is null (not globally finalizable).
   */
  async getScopeFinalLockDate(
    tx: Prisma.TransactionClient,
    branchIds: string[],
  ): Promise<string | null> {
    const unique = [...new Set(branchIds.filter(Boolean))];
    if (!unique.length) return null;
    const rows = await tx.$queryRawUnsafe<
      Array<{ accounting_lock_date: Date | string | null }>
    >(
      `SELECT accounting_lock_date
       FROM branches
       WHERE id = ANY($1::uuid[])`,
      unique,
    );
    if (rows.length !== unique.length) return null;
    const dates = rows
      .map((r) => this.toDateString(r.accounting_lock_date))
      .filter((v): v is string => Boolean(v));
    if (dates.length !== unique.length) return null;
    dates.sort();
    return dates[0] ?? null;
  }

  async getReportFinalization(
    tx: Prisma.TransactionClient,
    branchIds: string[],
    reportEndDate: Date | string,
  ): Promise<{
    lockDate: string | null;
    isFinal: boolean;
  }> {
    const lockDate = await this.getScopeFinalLockDate(tx, branchIds);
    const reportDate = this.toDateString(reportEndDate);
    return {
      lockDate,
      isFinal: Boolean(lockDate && reportDate && reportDate <= lockDate),
    };
  }

  /**
   * Alias for readability at call sites that are not strictly "journal entry" dates
   * (e.g. sale_date, purchase_date, return_date).
   */
  assertDocumentDateOpen(
    tx: Prisma.TransactionClient,
    branchId: string,
    documentDate: Date | string,
  ): Promise<void> {
    return this.assertEntryDateOpen(tx, branchId, documentDate);
  }

  /**
   * Blocks posting when entry_date is on or before branch.accounting_lock_date (if set).
   */
  async assertEntryDateOpen(
    tx: Prisma.TransactionClient,
    branchId: string,
    entryDate: Date | string,
    sourceType?: string | null,
  ): Promise<void> {
    const dateStr =
      entryDate instanceof Date
        ? entryDate.toISOString().slice(0, 10)
        : String(entryDate).slice(0, 10);

    const [row] = await tx.$queryRawUnsafe<
      { accounting_lock_date: Date | string | null }[]
    >(
      `SELECT accounting_lock_date FROM branches WHERE id = $1::uuid`,
      branchId,
    );
    const lockRaw = row?.accounting_lock_date;
    if (lockRaw == null) return;
    const lockStr =
      lockRaw instanceof Date
        ? lockRaw.toISOString().slice(0, 10)
        : String(lockRaw).slice(0, 10);
    if (dateStr <= lockStr) {
      const st = (sourceType ?? '').trim();
      if (st && ADJUSTMENT_SOURCE_TYPES.has(st)) {
        return;
      }
      throw new BadRequestException(
        `Accounting is locked for dates on or before ${lockStr}. Entry date ${dateStr} is not allowed.`,
      );
    }
  }
}
