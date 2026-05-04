import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PatientLoanListRow {
  id: string;
  customer_id: string;
  branch_id: string;
  sale_id: string | null;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  due_date: Date | string | null;
  created_at: Date;
  customer_name: string | null;
}

export interface PatientLoanOutstandingRow {
  name: string | null;
  id: string;
  total_amount: number | string;
  amount_paid: number | string;
  balance: number | string;
}

export interface PatientLoanPaymentListRow {
  id: string;
  loan_id: string;
  amount: number | string;
  payment_method: string | null;
  payment_date: Date;
  created_at: Date;
}

export interface PatientLoanCoreRow {
  id: string;
  customer_id: string;
  branch_id: string;
  sale_id: string | null;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  due_date: Date | string | null;
  created_at: Date;
}

export interface PatientLoanRow extends PatientLoanCoreRow {
  customer_name: string | null;
}

export interface PatientLoanPaymentRow {
  id: string;
  loan_id: string;
  amount: number | string;
  payment_method: string | null;
  payment_date: Date;
  created_at: Date;
}

@Injectable()
export class PatientLoansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    schemaName: string,
    status: string | undefined,
    allowedBranchIds: string[],
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      let query = `
        SELECT pl.id, pl.customer_id, pl.branch_id, pl.sale_id, pl.total_amount,
               pl.amount_paid, pl.status, pl.due_date, pl.created_at,
               c.name as customer_name
        FROM patient_loans pl
        LEFT JOIN customers c ON c.id = pl.customer_id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      // Always enforce branch isolation.
      params.push(allowedBranchIds);
      query += ` AND pl.branch_id = ANY($${params.length}::uuid[])`;

      if (status) {
        params.push(status);
        query += ` AND pl.status = $${params.length}`;
      }
      query += ` ORDER BY pl.created_at DESC`;
      return tx.$queryRawUnsafe<PatientLoanListRow[]>(query, ...params);
    });
  }

  async findOutstanding(schemaName: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<PatientLoanOutstandingRow[]>(
        `SELECT c.name, pl.id, pl.total_amount, pl.amount_paid,
                (pl.total_amount - pl.amount_paid) AS balance
         FROM patient_loans pl
         JOIN customers c ON c.id = pl.customer_id
         WHERE pl.status = 'ongoing'
           AND pl.branch_id = ANY($1::uuid[])
         ORDER BY pl.created_at DESC`,
        allowedBranchIds,
      );
    });
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<PatientLoanRow[]>(
        `SELECT pl.id, pl.customer_id, pl.branch_id, pl.sale_id, pl.total_amount,
                pl.amount_paid, pl.status, pl.due_date, pl.created_at,
                c.name as customer_name
         FROM patient_loans pl
         LEFT JOIN customers c ON c.id = pl.customer_id
         WHERE pl.id = $1 AND pl.branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      return row ?? null;
    });
  }

  async findPayments(
    schemaName: string,
    loanId: string,
    allowedBranchIds: string[],
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) =>
      tx.$queryRawUnsafe<PatientLoanPaymentListRow[]>(
        `SELECT p.id, p.loan_id, p.amount, p.payment_method, p.payment_date, p.created_at
         FROM patient_loan_payments p
         JOIN patient_loans pl ON pl.id = p.loan_id
         WHERE p.loan_id = $1
           AND pl.branch_id = ANY($2::uuid[])
         ORDER BY p.payment_date DESC`,
        loanId,
        allowedBranchIds,
      ),
    );
  }

  async create(
    schemaName: string,
    branchId: string,
    dto: {
      customerId: string;
      saleId?: string;
      totalAmount: number;
      amountPaid?: number;
      status?: string;
      dueDate?: string;
    },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<PatientLoanCoreRow[]>(
        `INSERT INTO patient_loans (customer_id, branch_id, sale_id, total_amount, amount_paid, status, due_date)
         VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, 'ongoing'), $7)
         RETURNING id, customer_id, branch_id, sale_id, total_amount, amount_paid, status, due_date, created_at`,
        dto.customerId,
        branchId,
        dto.saleId ?? null,
        dto.totalAmount,
        dto.amountPaid ?? 0,
        dto.status ?? 'ongoing',
        dto.dueDate ?? null,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    branchId: string,
    allowedBranchIds: string[],
    dto: {
      saleId?: string;
      totalAmount?: number;
      status?: string;
      dueDate?: string;
    },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<PatientLoanCoreRow[]>(
        `UPDATE patient_loans SET
           branch_id = $2,
           sale_id = COALESCE($3, sale_id),
           total_amount = COALESCE($4, total_amount),
           status = COALESCE($5, status),
           due_date = COALESCE($6, due_date)
         WHERE id = $1 AND branch_id = ANY($7::uuid[])
         RETURNING id, customer_id, branch_id, sale_id, total_amount, amount_paid, status, due_date, created_at`,
        id,
        branchId,
        dto.saleId ?? null,
        dto.totalAmount ?? null,
        dto.status ?? null,
        dto.dueDate ?? null,
        allowedBranchIds,
      );
      return row ?? null;
    });
  }

  async addPayment(
    schemaName: string,
    loanId: string,
    allowedBranchIds: string[],
    dto: { amount: number; paymentMethod?: string },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      // 1) Update the loan only if it belongs to the allowed branch scope.
      const [loan] = await tx.$queryRawUnsafe<PatientLoanCoreRow[]>(
        `UPDATE patient_loans SET
           amount_paid = amount_paid + $2,
           status = CASE
             WHEN (amount_paid + $2) >= total_amount THEN 'paid'
             ELSE 'ongoing'
           END
         WHERE id = $1 AND branch_id = ANY($3::uuid[])
         RETURNING id, customer_id, branch_id, sale_id, total_amount, amount_paid, status, due_date, created_at`,
        loanId,
        dto.amount,
        allowedBranchIds,
      );

      if (!loan) return null;

      // 2) Record the payment.
      const [payment] = await tx.$queryRawUnsafe<PatientLoanPaymentRow[]>(
        `INSERT INTO patient_loan_payments (loan_id, amount, payment_method)
         VALUES ($1, $2, $3)
         RETURNING id, loan_id, amount, payment_method, payment_date, created_at`,
        loanId,
        dto.amount,
        dto.paymentMethod ?? null,
      );

      return { loan, payment };
    });
  }

  async remove(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `DELETE FROM patient_loans WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      return { deleted: true };
    });
  }
}
