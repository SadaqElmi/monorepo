import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingPostingService } from '../../accounting/accounting-posting.service';
import { AuditLogService } from '../../accounting/audit-log.service';
import { AccountingLockDateService } from '../../accounting/accounting-lock-date.service';
import { InventoryService } from '../../inventory/inventory.service';
import type { ParsedOpeningStockImportRow } from '../types/import.types';
import type { JournalSourceType } from '../../accounting/accounting.types';

export type OpeningStockInput = {
  branchId: string;
  productId: string;
  quantity: number;
  costPrice: number;
  listPrice: number;
  batchNumber: string | null;
  expiryDate: string | null;
  entryDate: string;
  externalRef: string | null;
  importJobId: string;
  importJobRowId: string;
  userId: string | null;
  glSourceType?: JournalSourceType;
};

export type OpeningStockResult = {
  batchId: string;
  openingStockEntryId: string;
  journalEntryId: string | null;
};

@Injectable()
export class OpeningStockService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createOpeningStock(
    tx: Prisma.TransactionClient,
    input: OpeningStockInput,
  ): Promise<OpeningStockResult> {
    const qty = Math.floor(input.quantity);
    if (qty <= 0) {
      throw new Error('Opening stock quantity must be positive');
    }

    const glSource:
      | 'product_import_opening_stock'
      | 'opening_stock_import' =
      input.glSourceType === 'product_import_opening_stock'
        ? 'product_import_opening_stock'
        : 'opening_stock_import';
    const lockContext =
      glSource === 'product_import_opening_stock'
        ? 'product_import_opening_stock'
        : 'opening_stock_import';

    await this.lockDates.assertEntryDateOpen(
      tx,
      input.branchId,
      input.entryDate,
      lockContext,
    );

    const [batch] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO batches (branch_id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price)
       VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6, $7)
       RETURNING id::text AS id`,
      input.branchId,
      input.productId,
      input.batchNumber,
      input.expiryDate,
      qty,
      input.costPrice,
      input.listPrice,
    );
    if (!batch) throw new Error('Failed to create batch');

    await this.inventoryService.increaseStock(tx, {
      branchId: input.branchId,
      productId: input.productId,
      quantity: qty,
    });

    const inventoryTotal = qty * input.costPrice;
    const [entry] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO opening_stock_entries (
         branch_id, product_id, batch_id, import_job_id, import_job_row_id,
         quantity, cost_price, entry_date, external_ref, created_by
       )
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::date, $9, $10::uuid)
       RETURNING id::text AS id`,
      input.branchId,
      input.productId,
      batch.id,
      input.importJobId,
      input.importJobRowId,
      qty,
      input.costPrice,
      input.entryDate,
      input.externalRef,
      input.userId,
    );
    if (!entry) throw new Error('Failed to create opening stock entry');

    await this.accountingPosting.postOpeningStockJournal(tx, {
      branchId: input.branchId,
      openingStockEntryId: entry.id,
      inventoryTotal,
      entryDate: input.entryDate,
      sourceType: glSource,
    });

    const [je] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text AS id FROM journal_entries
       WHERE source_type = $2 AND source_id = $1::uuid
       LIMIT 1`,
      entry.id,
      glSource,
    );

    if (je?.id) {
      await tx.$executeRawUnsafe(
        `UPDATE opening_stock_entries SET journal_entry_id = $2::uuid WHERE id = $1::uuid`,
        entry.id,
        je.id,
      );
    }

    await this.auditLog.append(tx, {
      branchId: input.branchId,
      actorUserId: input.userId,
      tableName: 'opening_stock_entries',
      recordId: entry.id,
      action: 'import_create',
      entityType: 'opening_stock_entry',
      entityId: entry.id,
      newPayload: {
        productId: input.productId,
        batchId: batch.id,
        quantity: qty,
        costPrice: input.costPrice,
        importJobId: input.importJobId,
        importJobRowId: input.importJobRowId,
        externalRef: input.externalRef,
      },
    });

    return {
      batchId: batch.id,
      openingStockEntryId: entry.id,
      journalEntryId: je?.id ?? null,
    };
  }

  autoBatchNumber(row: ParsedOpeningStockImportRow): string {
    const date = row.openingDate ?? new Date().toISOString().slice(0, 10);
    const compact = date.replace(/-/g, '');
    return `OPEN-${row.itemNo}-${compact}`;
  }
}
