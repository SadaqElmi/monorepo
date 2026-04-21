import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DEFAULT_BOOKS: readonly {
  code: string;
  name: string;
  bookKind: string;
}[] = [
  { code: 'SLS', name: 'Sales', bookKind: 'sales' },
  { code: 'PUR', name: 'Purchases', bookKind: 'purchase' },
  { code: 'CSH', name: 'Cash', bookKind: 'cash' },
  { code: 'MISC', name: 'Miscellaneous', bookKind: 'misc' },
] as const;

@Injectable()
export class JournalBooksSeedService {
  /**
   * Idempotent Odoo-style journal books per branch.
   */
  async ensureBooksForBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<void> {
    for (const b of DEFAULT_BOOKS) {
      await tx.$queryRawUnsafe(
        `INSERT INTO accounting_journal_books (branch_id, code, name, book_kind)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (branch_id, code) DO NOTHING`,
        branchId,
        b.code,
        b.name,
        b.bookKind,
      );
    }
  }

  async listBooks(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<
    {
      id: string;
      code: string;
      name: string;
      bookKind: string;
    }[]
  > {
    const rows = await tx.$queryRawUnsafe<
      {
        id: string;
        code: string;
        name: string;
        book_kind: string;
      }[]
    >(
      `SELECT id, code, name, book_kind
       FROM accounting_journal_books
       WHERE branch_id = $1::uuid
       ORDER BY code`,
      branchId,
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      bookKind: r.book_kind,
    }));
  }
}
