import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingPostingService } from './accounting-posting.service';
import { AccountingLockDateService } from './accounting-lock-date.service';
import { AuditLogService } from './audit-log.service';
import type { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import type { PaymentMutationContext } from './payment-mutation.context';

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(
    schemaName: string,
    branchId: string,
    dto: CreateSupplierPaymentDto,
    ctx?: PaymentMutationContext,
  ) {
    const amt = Number(dto.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const dateStr = dto.paymentDate.trim().slice(0, 10);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.lockDates.assertDocumentDateOpen(tx, branchId, dateStr);

      const [sup] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM suppliers WHERE id = $1::uuid`,
        dto.supplierId,
      );
      if (!sup) {
        throw new NotFoundException('Supplier not found');
      }

      const [row] = await tx.$queryRawUnsafe<
        {
          id: string;
          branch_id: string;
          supplier_id: string;
          amount: string;
          payment_date: string;
          reference: string | null;
          notes: string | null;
          payment_method: string | null;
          created_at: Date | null;
        }[]
      >(
        `INSERT INTO supplier_payments (
           branch_id, supplier_id, amount, payment_date, reference, notes, payment_method
         )
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::date, $5, $6, $7)
         RETURNING id, branch_id, supplier_id, amount::text, payment_date::text,
                   reference, notes, payment_method, created_at`,
        branchId,
        dto.supplierId,
        amt,
        dateStr,
        dto.reference?.trim() || null,
        dto.notes?.trim() || null,
        dto.paymentMethod?.trim() || null,
      );
      if (!row) {
        throw new BadRequestException('Could not record supplier payment');
      }

      await this.accountingPosting.postApPaymentJournal(tx, {
        branchId,
        paymentId: row.id,
        amount: amt,
        entryDate: dateStr,
        paymentMethod: dto.paymentMethod,
        supplierId: dto.supplierId,
      });

      const [withName] = await tx.$queryRawUnsafe<
        { supplier_name: string | null }[]
      >(
        `SELECT s.name AS supplier_name
         FROM supplier_payments sp
         INNER JOIN suppliers s ON s.id = sp.supplier_id
         WHERE sp.id = $1::uuid`,
        row.id,
      );

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'supplier_payments',
        recordId: row.id,
        action: 'create',
        newPayload: {
          amount: amt,
          payment_date: dateStr,
          supplier_id: dto.supplierId,
        },
      });

      return {
        id: row.id,
        branchId: row.branch_id,
        supplierId: row.supplier_id,
        supplierName: withName?.supplier_name ?? null,
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
          supplier_id: string;
          supplier_name: string | null;
          amount: string;
          payment_date: string;
          reference: string | null;
          notes: string | null;
          payment_method: string | null;
          created_at: Date | null;
        }[]
      >(
        `SELECT sp.id, sp.branch_id, sp.supplier_id, s.name AS supplier_name,
                sp.amount::text, sp.payment_date::text, sp.reference, sp.notes,
                sp.payment_method, sp.created_at
         FROM supplier_payments sp
         LEFT JOIN suppliers s ON s.id = sp.supplier_id
         WHERE sp.branch_id = $1::uuid
         ORDER BY sp.payment_date DESC, sp.created_at DESC
         LIMIT $2`,
        branchId,
        take,
      );
      return rows.map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        amount: Number(r.amount),
        paymentDate: r.payment_date,
        reference: r.reference,
        notes: r.notes,
        paymentMethod: r.payment_method,
        createdAt: r.created_at,
      }));
    });
  }
}
