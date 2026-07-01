import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCalendarDateString } from '../common/date/calendar-date.util';
import type { JournalSourceType } from './accounting.types';
import { AccountingLockDateService } from './accounting-lock-date.service';

const EPS = 0.005;

export type JournalLineInput = {
  accountId: string;
  debit: number;
  credit: number;
  /** Subledger: customer or supplier for partner reports */
  partnerKind?: 'customer' | 'supplier' | null;
  partnerId?: string | null;
};

@Injectable()
export class JournalService {
  constructor(private readonly lockDates: AccountingLockDateService) {}

  async assertJournalIntegrity(
    tx: Prisma.TransactionClient,
    journalEntryId: string,
  ): Promise<{ isBalanced: boolean; debit: number; credit: number }> {
    const [totals] = await tx.$queryRawUnsafe<
      { debit_total: number; credit_total: number }[]
    >(
      `SELECT
         COALESCE(SUM(debit), 0)::numeric AS debit_total,
         COALESCE(SUM(credit), 0)::numeric AS credit_total
       FROM journal_lines
       WHERE journal_entry_id = $1::uuid`,
      journalEntryId,
    );
    const debit = round2(Number(totals?.debit_total ?? 0));
    const credit = round2(Number(totals?.credit_total ?? 0));
    const isBalanced = Math.abs(debit - credit) <= EPS;
    if (!isBalanced) {
      throw new BadRequestException(
        `Journal not balanced: debits ${debit} vs credits ${credit}`,
      );
    }
    return { isBalanced, debit, credit };
  }

  async journalExistsForSource(
    tx: Prisma.TransactionClient,
    branchId: string,
    sourceType: JournalSourceType,
    sourceId: string,
  ): Promise<boolean> {
    const [row] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c
       FROM journal_entries
       WHERE branch_id = $1::uuid AND source_type = $2 AND source_id = $3::uuid`,
      branchId,
      sourceType,
      sourceId,
    );
    return Number(row?.c ?? 0) > 0;
  }

  /**
   * Inserts a balanced journal entry. Skips if one already exists for the same source (idempotent).
   * Throws if debits != credits.
   */
  async createBalancedEntry(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      entryDate: Date | string;
      description: string | null;
      sourceType: JournalSourceType;
      sourceId: string | null;
      lines: JournalLineInput[];
      /** Optional link to accounting_journal_books (configuration). */
      journalBookId?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const {
      branchId,
      entryDate,
      description,
      sourceType,
      sourceId,
      lines,
      journalBookId,
    } = params;

    if (sourceId) {
      const exists = await this.journalExistsForSource(
        tx,
        branchId,
        sourceType,
        sourceId,
      );
      if (exists) return null;
    }

    let debits = 0;
    let credits = 0;
    for (const ln of lines) {
      debits += round2(ln.debit);
      credits += round2(ln.credit);
    }
    if (Math.abs(debits - credits) > EPS) {
      throw new BadRequestException(
        `Journal not balanced: debits ${debits} vs credits ${credits}`,
      );
    }
    if (lines.length === 0) {
      throw new BadRequestException('Journal must have at least one line');
    }

    await this.lockDates.assertEntryDateOpen(
      tx,
      branchId,
      entryDate,
      sourceType,
    );

    const dateStr =
      toCalendarDateString(entryDate) ?? String(entryDate).slice(0, 10);

    const [je] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO journal_entries (branch_id, entry_date, description, source_type, source_id, journal_book_id)
       VALUES ($1::uuid, $2::date, $3, $4, $5::uuid, $6::uuid)
       RETURNING id`,
      branchId,
      dateStr,
      description,
      sourceType,
      sourceId,
      journalBookId ?? null,
    );

    for (const ln of lines) {
      const d = round2(ln.debit);
      const c = round2(ln.credit);
      if (d === 0 && c === 0) continue;
      const pk = ln.partnerKind ?? null;
      const pid = ln.partnerId ?? null;
      await tx.$queryRawUnsafe(
        `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, partner_kind, partner_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)`,
        je.id,
        ln.accountId,
        d,
        c,
        pk,
        pid,
      );
    }

    await this.assertJournalIntegrity(tx, je.id);

    return { id: je.id };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
