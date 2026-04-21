import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingPostingService } from './accounting-posting.service';
import { AccountingLockDateService } from './accounting-lock-date.service';
import { AuditLogService } from './audit-log.service';
import type { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import type { PaymentMutationContext } from './payment-mutation.context';

@Injectable()
export class CustomerPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(
    schemaName: string,
    branchId: string,
    dto: CreateCustomerPaymentDto,
    ctx?: PaymentMutationContext,
  ) {
    const amt = Number(dto.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const dateStr = dto.paymentDate.trim().slice(0, 10);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.lockDates.assertDocumentDateOpen(tx, branchId, dateStr);

      const [cust] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM customers WHERE id = $1::uuid`,
        dto.customerId,
      );
      if (!cust) {
        throw new NotFoundException('Customer not found');
      }

      const [row] = await tx.$queryRawUnsafe<
        {
          id: string;
          branch_id: string;
          customer_id: string;
          amount: string;
          payment_date: string;
          reference: string | null;
          notes: string | null;
          payment_method: string | null;
          created_at: Date | null;
        }[]
      >(
        `INSERT INTO customer_payments (
           branch_id, customer_id, amount, payment_date, reference, notes, payment_method
         )
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::date, $5, $6, $7)
         RETURNING id, branch_id, customer_id, amount::text, payment_date::text,
                   reference, notes, payment_method, created_at`,
        branchId,
        dto.customerId,
        amt,
        dateStr,
        dto.reference?.trim() || null,
        dto.notes?.trim() || null,
        dto.paymentMethod?.trim() || null,
      );
      if (!row) {
        throw new BadRequestException('Could not record customer payment');
      }

      await this.accountingPosting.postArPaymentJournal(tx, {
        branchId,
        paymentId: row.id,
        amount: amt,
        entryDate: dateStr,
        paymentMethod: dto.paymentMethod,
        customerId: dto.customerId,
      });

      if (dto.allocations?.length) {
        let sum = 0;
        for (const a of dto.allocations) {
          const al = Number(a.amount);
          if (!Number.isFinite(al) || al <= 0) {
            throw new BadRequestException(
              'Allocation amounts must be positive',
            );
          }
          sum += al;
          const [sale] = await tx.$queryRawUnsafe<
            { id: string; branch_id: string; customer_id: string | null }[]
          >(
            `SELECT id, branch_id, customer_id FROM sales WHERE id = $1::uuid`,
            a.saleId,
          );
          if (!sale || sale.branch_id !== branchId) {
            throw new BadRequestException(
              `Invalid sale for allocation: ${a.saleId}`,
            );
          }
          if (sale.customer_id && sale.customer_id !== dto.customerId) {
            throw new BadRequestException(
              'Allocated sale does not belong to this customer',
            );
          }
          await tx.$queryRawUnsafe(
            `INSERT INTO customer_payment_allocations (customer_payment_id, sale_id, amount)
             VALUES ($1::uuid, $2::uuid, $3::numeric)`,
            row.id,
            a.saleId,
            al,
          );
        }
        if (sum > amt + 0.005) {
          throw new BadRequestException(
            'Sum of allocations cannot exceed payment amount',
          );
        }
      }

      const [withName] = await tx.$queryRawUnsafe<
        { customer_name: string | null }[]
      >(
        `SELECT c.name AS customer_name
         FROM customer_payments cp
         INNER JOIN customers c ON c.id = cp.customer_id
         WHERE cp.id = $1::uuid`,
        row.id,
      );

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'customer_payments',
        recordId: row.id,
        action: 'create',
        newPayload: {
          amount: amt,
          payment_date: dateStr,
          customer_id: dto.customerId,
        },
      });

      return {
        id: row.id,
        branchId: row.branch_id,
        customerId: row.customer_id,
        customerName: withName?.customer_name ?? null,
        amount: Number(row.amount),
        paymentDate: row.payment_date,
        reference: row.reference,
        notes: row.notes,
        paymentMethod: row.payment_method,
        createdAt: row.created_at,
      };
    });
  }

  async findRecent(schemaName: string, branchId: string, limit = 50) {
    const take = Math.min(200, Math.max(1, limit));
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          branch_id: string;
          customer_id: string;
          customer_name: string | null;
          amount: string;
          payment_date: string;
          reference: string | null;
          notes: string | null;
          payment_method: string | null;
          created_at: Date | null;
        }[]
      >(
        `SELECT cp.id, cp.branch_id, cp.customer_id, c.name AS customer_name,
                cp.amount::text, cp.payment_date::text, cp.reference, cp.notes,
                cp.payment_method, cp.created_at
         FROM customer_payments cp
         LEFT JOIN customers c ON c.id = cp.customer_id
         WHERE cp.branch_id = $1::uuid
         ORDER BY cp.payment_date DESC, cp.created_at DESC
         LIMIT $2`,
        branchId,
        take,
      );
      return rows.map(
        (r: {
          id: string;
          branch_id: string;
          customer_id: string;
          customer_name: string | null;
          amount: string;
          payment_date: string;
          reference: string | null;
          notes: string | null;
          payment_method: string | null;
          created_at: Date | null;
        }) => ({
          id: r.id,
          branchId: r.branch_id,
          customerId: r.customer_id,
          customerName: r.customer_name,
          amount: Number(r.amount),
          paymentDate: r.payment_date,
          reference: r.reference,
          notes: r.notes,
          paymentMethod: r.payment_method,
          createdAt: r.created_at,
        }),
      );
    });
  }
}
