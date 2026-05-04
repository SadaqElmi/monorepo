import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';

export type ExpenseMutationContext = {
  actorUserId?: string | null;
};

export interface ExpenseRow {
  id: string;
  category_id: string | null;
  branch_id: string;
  amount: number | string;
  description: string | null;
  expense_date: Date | string | null;
  created_at: Date;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<ExpenseRow[]>(
        `SELECT id, category_id, branch_id, amount, description, expense_date, created_at
         FROM expenses
         WHERE branch_id = ANY($1::uuid[])
         ORDER BY expense_date DESC`,
        allowedBranchIds,
      ),
    );
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<ExpenseRow[]>(
        `SELECT id, category_id, branch_id, amount, description, expense_date, created_at
         FROM expenses
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    branchId: string,
    dto: {
      categoryId?: string;
      amount?: number;
      description?: string;
      expenseDate?: string;
    },
    ctx?: ExpenseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const ed = dto.expenseDate?.trim();
      const docDateForLock =
        ed && ed.length >= 10 ? ed.slice(0, 10) : new Date();
      await this.lockDates.assertDocumentDateOpen(tx, branchId, docDateForLock);

      const [row] = await tx.$queryRawUnsafe<ExpenseRow[]>(
        `INSERT INTO expenses (category_id, branch_id, amount, description, expense_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, category_id, branch_id, amount, description, expense_date, created_at`,
        dto.categoryId ?? null,
        branchId,
        dto.amount ?? null,
        dto.description ?? null,
        dto.expenseDate ?? null,
      );
      const entryDate = row.expense_date ?? row.created_at ?? new Date();
      let expenseAccountKey: string | null = null;
      if (row.category_id) {
        const [ec] = await tx.$queryRawUnsafe<
          { gl_account_key: string | null }[]
        >(
          `SELECT gl_account_key FROM expense_categories WHERE id = $1`,
          row.category_id,
        );
        expenseAccountKey = ec?.gl_account_key ?? null;
      }
      await this.accountingPosting.postExpenseJournal(tx, {
        branchId,
        expenseId: row.id,
        amount: Number(row.amount ?? 0),
        entryDate,
        expenseAccountKey,
      });

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'expenses',
        recordId: row.id,
        action: 'create',
        newPayload: { amount: row.amount, expense_date: row.expense_date },
      });

      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    branchId: string,
    allowedBranchIds: string[],
    dto: {
      categoryId?: string;
      amount?: number;
      description?: string;
      expenseDate?: string;
    },
    ctx?: ExpenseMutationContext,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [existing] = await tx.$queryRawUnsafe<
        {
          id: string;
          branch_id: string;
          expense_date: Date | string | null;
          created_at: Date | string | null;
        }[]
      >(
        `SELECT id, branch_id, expense_date, created_at
         FROM expenses
         WHERE id = $1::uuid AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!existing) {
        return null;
      }
      const priorDate =
        existing.expense_date != null
          ? existing.expense_date
          : (existing.created_at ?? new Date());
      await this.lockDates.assertDocumentDateOpen(
        tx,
        existing.branch_id,
        priorDate,
      );
      const newDateRaw = dto.expenseDate?.trim();
      if (newDateRaw) {
        await this.lockDates.assertDocumentDateOpen(
          tx,
          branchId,
          newDateRaw.slice(0, 10),
        );
      }

      const [row] = await tx.$queryRawUnsafe<ExpenseRow[]>(
        `UPDATE expenses
         SET category_id = COALESCE($2, category_id),
             branch_id = $3,
             amount = COALESCE($4, amount),
             description = COALESCE($5, description),
             expense_date = COALESCE($6, expense_date)
         WHERE id = $1 AND branch_id = ANY($7::uuid[])
         RETURNING id, category_id, branch_id, amount, description, expense_date, created_at`,
        id,
        dto.categoryId ?? null,
        branchId,
        dto.amount ?? null,
        dto.description ?? null,
        dto.expenseDate ?? null,
        allowedBranchIds,
      );
      if (row) {
        await this.auditLog.append(tx, {
          branchId: row.branch_id,
          actorUserId: ctx?.actorUserId ?? null,
          tableName: 'expenses',
          recordId: row.id,
          action: 'update',
          newPayload: {
            amount: row.amount,
            expense_date: row.expense_date,
          },
        });
      }
      return row ?? null;
    });
  }

  async remove(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    ctx?: ExpenseMutationContext,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [exp] = await tx.$queryRawUnsafe<
        {
          id: string;
          branch_id: string;
          category_id: string | null;
          amount: unknown;
          expense_date: Date | string | null;
          created_at: Date | string | null;
        }[]
      >(
        `SELECT id, branch_id, category_id, amount, expense_date, created_at
         FROM expenses
         WHERE id = $1::uuid AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!exp) {
        return { deleted: false };
      }

      const docDate =
        exp.expense_date != null
          ? exp.expense_date
          : (exp.created_at ?? new Date());
      await this.lockDates.assertDocumentDateOpen(tx, exp.branch_id, docDate);

      const amt = Number(exp.amount ?? 0);
      let expenseAccountKey: string | null = null;
      if (exp.category_id) {
        const [ec] = await tx.$queryRawUnsafe<
          { gl_account_key: string | null }[]
        >(
          `SELECT gl_account_key FROM expense_categories WHERE id = $1`,
          exp.category_id,
        );
        expenseAccountKey = ec?.gl_account_key ?? null;
      }

      const [posted] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM journal_entries
         WHERE branch_id = $1::uuid
           AND source_type = 'expense'
           AND source_id = $2::uuid`,
        exp.branch_id,
        id,
      );
      if (amt > 0 && Number(posted?.c ?? 0) > 0) {
        await this.accountingPosting.reverseExpenseJournal(tx, {
          branchId: exp.branch_id,
          expenseId: id,
          amount: amt,
          entryDate: docDate,
          expenseAccountKey,
        });
      } else if (amt > 0 && Number(posted?.c ?? 0) === 0) {
        throw new BadRequestException(
          'Expense amount is set but no GL entry exists; cannot remove safely.',
        );
      }

      await tx.$queryRawUnsafe(
        `DELETE FROM expenses WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );

      await this.auditLog.append(tx, {
        branchId: exp.branch_id,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'expenses',
        recordId: id,
        action: 'remove',
        oldPayload: { amount: amt, expense_date: exp.expense_date },
      });

      return { deleted: true };
    });
  }
}
