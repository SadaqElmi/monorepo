import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { CustomerPaymentsService } from '../accounting/customer-payments.service';
import type { CreateCustomerRepaymentDto } from './dto/create-customer-repayment.dto';

const CUSTOMER_SELECT = `
  id, name, phone, address, customer_no, credit_limit, credit_status,
  is_active, member_card_no, created_at
`;

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  customer_no: string | null;
  credit_limit: number | string | null;
  credit_status: string | null;
  is_active: boolean;
  member_card_no: string | null;
  created_at: Date;
}

type CustomerAuditRow = Pick<
  CustomerRow,
  | 'id'
  | 'name'
  | 'phone'
  | 'address'
  | 'customer_no'
  | 'credit_limit'
  | 'credit_status'
  | 'is_active'
  | 'member_card_no'
>;

export type CustomerCreditSummary = {
  customerId: string;
  customerName: string | null;
  customerNo: string | null;
  phone: string | null;
  creditLimit: number | null;
  creditStatus: string;
  isActive: boolean;
  outstandingBalance: number;
  availableCredit: number | null;
  totalSales: number;
  creditSalesCount: number;
  creditSalesTotal: number;
  repaymentsTotal: number;
  lastPaymentDate: string | null;
};

export type CustomerLoanHistoryRow = {
  saleId: string;
  receiptNumber: string | null;
  saleDate: string;
  originalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  dueDate: string | null;
  status: 'open' | 'partial' | 'paid' | 'overdue';
};

type CustomerWriteDto = {
  name?: string;
  phone?: string;
  address?: string;
  customerNo?: string;
  creditLimit?: number;
  creditStatus?: string;
  isActive?: boolean;
  memberCardNo?: string;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly auditLog: AuditLogService,
    private readonly customerPayments: CustomerPaymentsService,
  ) {}

  private mapCustomer(row: CustomerRow) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      customer_no: row.customer_no,
      credit_limit:
        row.credit_limit == null ? null : Number(row.credit_limit),
      credit_status: row.credit_status ?? 'active',
      is_active: row.is_active ?? true,
      member_card_no: row.member_card_no,
      created_at: row.created_at,
    };
  }

  async findAll(schemaName: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<CustomerRow[]>(
        `SELECT ${CUSTOMER_SELECT}
         FROM customers
         ORDER BY name`,
      ),
    );
    return rows.map((r) => this.mapCustomer(r));
  }

  async search(schemaName: string, q: string, limit = 25) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const term = q?.trim();
    if (!term) {
      return [];
    }
    const take = Math.min(50, Math.max(1, limit));
    const pattern = `%${term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<CustomerRow[]>(
        `SELECT ${CUSTOMER_SELECT}
         FROM customers
         WHERE (
           COALESCE(name, '') ILIKE $1 ESCAPE '\\'
           OR COALESCE(phone, '') ILIKE $1 ESCAPE '\\'
           OR COALESCE(customer_no, '') ILIKE $1 ESCAPE '\\'
           OR COALESCE(member_card_no, '') ILIKE $1 ESCAPE '\\'
           OR LEFT(id::text, 8) ILIKE $1 ESCAPE '\\'
         )
         AND COALESCE(is_active, TRUE) = TRUE
         ORDER BY name
         LIMIT $2`,
        pattern,
        take,
      ),
    );
    return rows.map((r) => this.mapCustomer(r));
  }

  async findOne(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [found] = await tx.$queryRawUnsafe<CustomerRow[]>(
        `SELECT ${CUSTOMER_SELECT} FROM customers WHERE id = $1::uuid`,
        id,
      );
      return found ?? null;
    });
    return row ? this.mapCustomer(row) : null;
  }

  async creditSummary(
    schemaName: string,
    customerId: string,
    branchIds: string[],
  ): Promise<CustomerCreditSummary> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const customer = await this.findOne(schemaName, customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [stats] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          outstanding_balance: number | string | null;
          total_sales: number | string | null;
          credit_sales_count: number | string | null;
          credit_sales_total: number | string | null;
          repayments_total: number | string | null;
          last_payment_date: string | null;
        }>
      >(
        `SELECT
           (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN chart_of_accounts coa ON coa.id = jl.account_id
            WHERE jl.partner_kind = 'customer'
              AND jl.partner_id = $1::uuid
              AND je.branch_id = ANY($2::uuid[])
              AND coa.account_key = 'accounts_receivable') AS outstanding_balance,
           (SELECT COUNT(*)::int FROM sales s
            WHERE s.customer_id = $1::uuid
              AND s.branch_id = ANY($2::uuid[])) AS total_sales,
           (SELECT COUNT(*)::int FROM sales s
            WHERE s.customer_id = $1::uuid
              AND s.branch_id = ANY($2::uuid[])
              AND COALESCE(s.on_account, FALSE) = TRUE) AS credit_sales_count,
           (SELECT COALESCE(SUM(COALESCE(s.total_amount, 0)), 0)
            FROM sales s
            WHERE s.customer_id = $1::uuid
              AND s.branch_id = ANY($2::uuid[])
              AND COALESCE(s.on_account, FALSE) = TRUE) AS credit_sales_total,
           (SELECT COALESCE(SUM(cp.amount), 0)
            FROM customer_payments cp
            WHERE cp.customer_id = $1::uuid
              AND cp.branch_id = ANY($2::uuid[])) AS repayments_total,
           (SELECT MAX(cp.payment_date)::text
            FROM customer_payments cp
            WHERE cp.customer_id = $1::uuid
              AND cp.branch_id = ANY($2::uuid[])) AS last_payment_date`,
        customerId,
        branchIds,
      ),
    );

    const outstanding = Number(stats?.outstanding_balance ?? 0);
    const creditLimit =
      customer.credit_limit == null ? null : Number(customer.credit_limit);
    const availableCredit =
      creditLimit == null ? null : Math.max(0, creditLimit - outstanding);

    return {
      customerId,
      customerName: customer.name,
      customerNo: customer.customer_no,
      phone: customer.phone,
      creditLimit,
      creditStatus: customer.credit_status ?? 'active',
      isActive: customer.is_active ?? true,
      outstandingBalance: outstanding,
      availableCredit,
      totalSales: Number(stats?.total_sales ?? 0),
      creditSalesCount: Number(stats?.credit_sales_count ?? 0),
      creditSalesTotal: Number(stats?.credit_sales_total ?? 0),
      repaymentsTotal: Number(stats?.repayments_total ?? 0),
      lastPaymentDate: stats?.last_payment_date ?? null,
    };
  }

  async loanHistory(
    schemaName: string,
    customerId: string,
    branchIds: string[],
  ): Promise<CustomerLoanHistoryRow[]> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const customer = await this.findOne(schemaName, customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          sale_id: string;
          receipt_number: string | null;
          sale_date: Date;
          original_amount: number | string;
          paid_amount: number | string;
          due_date: string | null;
        }>
      >(
        `SELECT
           s.id AS sale_id,
           s.receipt_number,
           s.sale_date,
           COALESCE(s.total_amount, 0)::numeric AS original_amount,
           COALESCE((
             SELECT SUM(cpa.amount)
             FROM customer_payment_allocations cpa
             INNER JOIN customer_payments cp ON cp.id = cpa.customer_payment_id
             WHERE cpa.sale_id = s.id
           ), 0)::numeric AS paid_amount,
           s.due_date::text AS due_date
         FROM sales s
         WHERE s.customer_id = $1::uuid
           AND s.branch_id = ANY($2::uuid[])
           AND COALESCE(s.on_account, FALSE) = TRUE
         ORDER BY s.sale_date DESC`,
        customerId,
        branchIds,
      ),
    );

    const today = new Date().toISOString().slice(0, 10);
    return rows.map((r) => {
      const original = Number(r.original_amount);
      const paid = Number(r.paid_amount);
      const remaining = Math.max(0, original - paid);
      let status: CustomerLoanHistoryRow['status'] = 'open';
      if (remaining <= 0.005) {
        status = 'paid';
      } else if (paid > 0) {
        status = 'partial';
      }
      if (
        remaining > 0.005 &&
        r.due_date &&
        r.due_date < today
      ) {
        status = 'overdue';
      }
      return {
        saleId: r.sale_id,
        receiptNumber: r.receipt_number,
        saleDate:
          r.sale_date instanceof Date
            ? r.sale_date.toISOString()
            : String(r.sale_date),
        originalAmount: original,
        paidAmount: paid,
        remainingBalance: remaining,
        dueDate: r.due_date,
        status,
      };
    });
  }

  async createRepayment(
    schemaName: string,
    customerId: string,
    dto: CreateCustomerRepaymentDto,
    actorUserId?: string | null,
  ) {
    const customer = await this.findOne(schemaName, customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.customerPayments.create(
      schemaName,
      dto.branchId,
      {
        branchId: dto.branchId,
        customerId,
        amount: dto.amount,
        paymentDate: dto.paymentDate,
        reference: dto.reference,
        notes: dto.notes,
        paymentMethod: dto.paymentMethod,
        allocations: dto.allocations,
      },
      { actorUserId },
    );
  }

  async create(schemaName: string, dto: CustomerWriteDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<CustomerRow[]>(
        `INSERT INTO customers (
           name, phone, address, customer_no, credit_limit,
           credit_status, is_active, member_card_no
         )
         VALUES ($1, $2, $3, $4, $5::numeric, COALESCE($6, 'active'), COALESCE($7, TRUE), $8)
         RETURNING ${CUSTOMER_SELECT}`,
        dto.name ?? null,
        dto.phone ?? null,
        dto.address ?? null,
        dto.customerNo?.trim() || null,
        dto.creditLimit ?? null,
        dto.creditStatus?.trim() || null,
        dto.isActive ?? true,
        dto.memberCardNo?.trim() || null,
      );
      return row ? this.mapCustomer(row) : null;
    });
  }

  async update(schemaName: string, id: string, dto: CustomerWriteDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [prev] = await tx.$queryRawUnsafe<CustomerAuditRow[]>(
        `SELECT id, name, phone, address, customer_no, credit_limit,
                credit_status, is_active, member_card_no
         FROM customers WHERE id = $1::uuid`,
        id,
      );
      const [row] = await tx.$queryRawUnsafe<CustomerRow[]>(
        `UPDATE customers SET
           name = COALESCE($2, name),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           customer_no = COALESCE($5, customer_no),
           credit_limit = COALESCE($6::numeric, credit_limit),
           credit_status = COALESCE($7, credit_status),
           is_active = COALESCE($8, is_active),
           member_card_no = COALESCE($9, member_card_no)
         WHERE id = $1::uuid
         RETURNING ${CUSTOMER_SELECT}`,
        id,
        dto.name ?? null,
        dto.phone ?? null,
        dto.address ?? null,
        dto.customerNo?.trim() || null,
        dto.creditLimit ?? null,
        dto.creditStatus?.trim() || null,
        dto.isActive ?? null,
        dto.memberCardNo?.trim() || null,
      );
      if (row && prev) {
        await this.auditLog.append(tx, {
          tableName: 'customers',
          recordId: id,
          action: 'update',
          oldPayload: prev,
          newPayload: row as unknown as Record<string, unknown>,
        });
      }
      return row ? this.mapCustomer(row) : null;
    });
  }

  async remove(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM customers WHERE id = $1::uuid`, id);
      return { deleted: true };
    });
  }

  async getOutstandingBalance(
    tx: { $queryRawUnsafe: typeof PrismaService.prototype.$queryRawUnsafe },
    customerId: string,
    branchIds: string[],
  ): Promise<number> {
    const [row] = await tx.$queryRawUnsafe<{ outstanding: number | string }[]>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric AS outstanding
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       WHERE jl.partner_kind = 'customer'
         AND jl.partner_id = $1::uuid
         AND je.branch_id = ANY($2::uuid[])
         AND coa.account_key = 'accounts_receivable'`,
      customerId,
      branchIds,
    );
    return Number(row?.outstanding ?? 0);
  }

  async assertCustomerCreditEligible(
    tx: { $queryRawUnsafe: typeof PrismaService.prototype.$queryRawUnsafe },
    customerId: string,
    branchId: string,
  ): Promise<{
    id: string;
    credit_limit: number | string | null;
    credit_status: string | null;
    is_active: boolean;
    name: string | null;
  }> {
    const [cust] = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        credit_limit: number | string | null;
        credit_status: string | null;
        is_active: boolean;
        name: string | null;
      }>
    >(
      `SELECT id, credit_limit, credit_status, COALESCE(is_active, TRUE) AS is_active, name
       FROM customers WHERE id = $1::uuid`,
      customerId,
    );
    if (!cust) {
      throw new BadRequestException('Customer not found');
    }
    if (!cust.is_active) {
      throw new BadRequestException('Customer is inactive');
    }
    const status = (cust.credit_status ?? 'active').toLowerCase();
    if (status === 'blocked') {
      throw new BadRequestException('Customer credit is blocked');
    }
    return cust;
  }
}
