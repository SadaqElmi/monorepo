import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportJobsService } from './import-jobs.service';

export type ReverseImportResult = {
  reversedStockRows: number;
  reversedQty: number;
  reversedGlTotal: number;
};

type OpeningStockEntryRow = {
  id: string;
  branchId: string;
  productId: string;
  batchId: string;
  importJobRowId: string | null;
  quantity: number;
  costPrice: number;
  entryDate: string;
  batchQuantity: number;
  branchLockDate: string | null;
};

export type ReverseEligibility = {
  canReverse: boolean;
  reason: string | null;
  entryCount: number;
};

export type ImportProductCleanupCandidate = {
  productId: string;
  itemNo: string | null;
  name: string;
  canDelete: boolean;
  reasons: string[];
  counts: {
    sales: number;
    saleReturns: number;
    purchases: number;
    transfers: number;
    unreversedOpeningStock: number;
    reversedOpeningStock: number;
    otherOpeningStock: number;
    inventoryQuantity: number;
    batchQuantity: number;
  };
};

export type ImportProductCleanupPreview = {
  jobId: string;
  totalCandidates: number;
  deletableProducts: number;
  blockedProducts: number;
  candidates: ImportProductCleanupCandidate[];
};

export type ImportProductCleanupResult = ImportProductCleanupPreview & {
  deletedProducts: number;
  deletedProductIds: string[];
};

type ImportProductCleanupCandidateRow = {
  product_id: string;
  item_no: string | null;
  name: string;
};

type ImportProductCleanupCountsRow = {
  sales: number;
  sale_returns: number;
  purchases: number;
  transfers: number;
  unreversed_opening_stock: number;
  reversed_opening_stock: number;
  other_opening_stock: number;
  inventory_quantity: number;
  batch_quantity: number;
};

@Injectable()
export class ImportRollbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ImportJobsService,
    private readonly inventoryService: InventoryService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async getReverseEligibility(
    schemaName: string,
    jobId: string,
  ): Promise<ReverseEligibility> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) {
      return { canReverse: false, reason: 'Import job not found', entryCount: 0 };
    }
    if (job.status === 'reversed') {
      return {
        canReverse: false,
        reason: 'Import has already been reversed',
        entryCount: 0,
      };
    }
    if (job.status !== 'completed') {
      return {
        canReverse: false,
        reason: 'Only completed imports can be reversed',
        entryCount: 0,
      };
    }

    if (job.importType === 'purchase') {
      return {
        canReverse: false,
        reason: 'Purchase import reversal is no longer supported',
        entryCount: 0,
      };
    }

    const entries = await this.loadUnreversedEntries(schemaName, jobId);
    if (!entries.length) {
      const reason =
        job.importType === 'product'
          ? 'Product catalog imports do not create stock to reverse'
          : 'No opening stock entries to reverse';
      return {
        canReverse: false,
        reason,
        entryCount: 0,
      };
    }

    try {
      this.assertEntriesReversible(entries);
      return { canReverse: true, reason: null, entryCount: entries.length };
    } catch (e) {
      return {
        canReverse: false,
        reason: e instanceof Error ? e.message : 'Reversal blocked',
        entryCount: entries.length,
      };
    }
  }

  async reverseCompletedJob(
    schemaName: string,
    tenantId: string,
    jobId: string,
    userId: string | null,
  ): Promise<ReverseImportResult> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === 'reversed') {
      throw new BadRequestException('Import has already been reversed');
    }
    if (job.status !== 'completed') {
      throw new BadRequestException(
        `Only completed imports can be reversed (status: ${job.status})`,
      );
    }

    if (job.importType === 'purchase') {
      throw new BadRequestException(
        'Purchase import reversal is no longer supported',
      );
    }

    const entries = await this.loadUnreversedEntries(schemaName, jobId);
    if (!entries.length) {
      throw new BadRequestException('No opening stock entries to reverse');
    }
    this.assertEntriesReversible(entries);

    let reversedQty = 0;
    let reversedGlTotal = 0;
    const branchIds = new Set<string>();

    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      for (const entry of entries) {
        branchIds.add(entry.branchId);
        const qty = Math.floor(entry.quantity);
        const glTotal = qty * entry.costPrice;

        const originalSource = await this.resolveOpeningStockGlSource(
          tx,
          entry.id,
        );
        const lockContext =
          originalSource === 'product_import_opening_stock'
            ? 'product_import_opening_stock_reversal'
            : 'opening_stock_import_reversal';

        await this.lockDates.assertEntryDateOpen(
          tx,
          entry.branchId,
          entry.entryDate,
          lockContext,
        );

        await this.inventoryService.decreaseStock(tx, {
          branchId: entry.branchId,
          productId: entry.productId,
          quantity: qty,
        });

        await tx.$executeRawUnsafe(
          `UPDATE batches SET quantity = quantity - $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid`,
          entry.batchId,
          qty,
        );

        const [batchAfter] = await tx.$queryRawUnsafe<
          Array<{ quantity: number | string }>
        >(
          `SELECT quantity FROM batches WHERE id = $1::uuid`,
          entry.batchId,
        );
        if (Number(batchAfter?.quantity ?? 0) <= 0) {
          await tx.$executeRawUnsafe(
            `DELETE FROM batches WHERE id = $1::uuid`,
            entry.batchId,
          );
        }

        await this.accountingPosting.reverseOpeningStockJournal(tx, {
          branchId: entry.branchId,
          openingStockEntryId: entry.id,
          inventoryTotal: glTotal,
          entryDate: entry.entryDate,
          originalSourceType: originalSource,
        });

        const reversalType =
          originalSource === 'product_import_opening_stock'
            ? 'product_import_opening_stock_reversal'
            : 'opening_stock_import_reversal';

        const [je] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id::text AS id FROM journal_entries
           WHERE source_type = $2
             AND source_id = $1::uuid
           LIMIT 1`,
          entry.id,
          reversalType,
        );

        await tx.$executeRawUnsafe(
          `UPDATE opening_stock_entries
           SET reversed_at = CURRENT_TIMESTAMP,
               reversal_journal_entry_id = $2::uuid
           WHERE id = $1::uuid`,
          entry.id,
          je?.id ?? null,
        );

        if (entry.importJobRowId) {
          await tx.$executeRawUnsafe(
            `UPDATE import_job_rows SET commit_status = 'reversed' WHERE id = $1::uuid`,
            entry.importJobRowId,
          );
        }

        await this.auditLog.append(tx, {
          branchId: entry.branchId,
          actorUserId: userId,
          tableName: 'opening_stock_entries',
          recordId: entry.id,
          action: 'import_reverse',
          entityType: 'opening_stock_entry',
          entityId: entry.id,
          newPayload: {
            importJobId: jobId,
            quantity: qty,
            costPrice: entry.costPrice,
            batchId: entry.batchId,
            productId: entry.productId,
          },
        });

        reversedQty += qty;
        reversedGlTotal += glTotal;
      }

      await tx.$executeRawUnsafe(
        `UPDATE import_jobs
         SET status = 'reversed',
             reversed_at = CURRENT_TIMESTAMP,
             reversed_by = $2::uuid,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        jobId,
        userId,
      );

      await this.auditLog.append(tx, {
        branchId: null,
        actorUserId: userId,
        tableName: 'import_jobs',
        recordId: jobId,
        action: 'import_reverse',
        entityType: 'import_job',
        entityId: jobId,
        newPayload: {
          reversedStockRows: entries.length,
          reversedQty,
          reversedGlTotal,
        },
      });
    });

    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      tenantId,
      schemaName,
      branchIds: [...branchIds],
    });

    return {
      reversedStockRows: entries.length,
      reversedQty,
      reversedGlTotal,
    };
  }

  async getProductCleanupPreview(
    schemaName: string,
    jobId: string,
  ): Promise<ImportProductCleanupPreview> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) throw new NotFoundException('Import job not found');

    const candidates = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) => {
        const rows = await this.loadImportCreatedProductCandidates(tx, jobId);
        const out: ImportProductCleanupCandidate[] = [];
        for (const row of rows) {
          out.push(await this.analyzeProductCleanupCandidate(tx, jobId, row));
        }
        return out;
      },
    );

    return this.toCleanupPreview(jobId, candidates);
  }

  async cleanupImportCreatedProducts(
    schemaName: string,
    jobId: string,
    userId: string | null,
  ): Promise<ImportProductCleanupResult> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) throw new NotFoundException('Import job not found');

    const deletedProductIds: string[] = [];
    const finalCandidates: ImportProductCleanupCandidate[] =
      await this.prisma.withTenantSchema(schemaName, async (tx) => {
        const rows = await this.loadImportCreatedProductCandidates(tx, jobId);
        const analyzed: ImportProductCleanupCandidate[] = [];

        for (const row of rows) {
          await tx.$queryRawUnsafe(
            `SELECT id FROM products WHERE id = $1::uuid FOR UPDATE`,
            row.product_id,
          );
          const candidate = await this.analyzeProductCleanupCandidate(
            tx,
            jobId,
            row,
          );
          analyzed.push(candidate);
          if (!candidate.canDelete) continue;

          await this.auditLog.append(tx, {
            branchId: null,
            actorUserId: userId,
            tableName: 'products',
            recordId: candidate.productId,
            action: 'import_cleanup_delete',
            entityType: 'product',
            entityId: candidate.productId,
            oldPayload: {
              importJobId: jobId,
              itemNo: candidate.itemNo,
              name: candidate.name,
              counts: candidate.counts,
            },
          });

          await tx.$executeRawUnsafe(
            `DELETE FROM opening_stock_entries
             WHERE product_id = $1::uuid
               AND import_job_id = $2::uuid
               AND reversed_at IS NOT NULL`,
            candidate.productId,
            jobId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM batches
             WHERE product_id = $1::uuid
               AND COALESCE(quantity, 0) = 0`,
            candidate.productId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM inventory
             WHERE product_id = $1::uuid
               AND COALESCE(quantity, 0) = 0`,
            candidate.productId,
          );
          const deleted = await tx.$executeRawUnsafe(
            `DELETE FROM products WHERE id = $1::uuid`,
            candidate.productId,
          );
          if (deleted > 0) {
            deletedProductIds.push(candidate.productId);
          }
        }

        if (deletedProductIds.length) {
          await this.auditLog.append(tx, {
            branchId: null,
            actorUserId: userId,
            tableName: 'import_jobs',
            recordId: jobId,
            action: 'import_cleanup_products',
            entityType: 'import_job',
            entityId: jobId,
            newPayload: {
              deletedProducts: deletedProductIds.length,
              deletedProductIds,
            },
          });
        }

        return analyzed;
      });

    return {
      ...this.toCleanupPreview(jobId, finalCandidates),
      deletedProducts: deletedProductIds.length,
      deletedProductIds,
    };
  }

  private toCleanupPreview(
    jobId: string,
    candidates: ImportProductCleanupCandidate[],
  ): ImportProductCleanupPreview {
    const deletableProducts = candidates.filter((c) => c.canDelete).length;
    return {
      jobId,
      totalCandidates: candidates.length,
      deletableProducts,
      blockedProducts: candidates.length - deletableProducts,
      candidates,
    };
  }

  private async loadImportCreatedProductCandidates(
    tx: Prisma.TransactionClient,
    jobId: string,
  ): Promise<ImportProductCleanupCandidateRow[]> {
    return tx.$queryRawUnsafe<ImportProductCleanupCandidateRow[]>(
      `WITH job_products AS (
         SELECT DISTINCT resolved_product_id AS product_id
         FROM import_job_rows
         WHERE job_id = $1::uuid
           AND resolved_product_id IS NOT NULL
           AND (
             validation_result->>'action' = 'create_product'
             OR EXISTS (
               SELECT 1
               FROM audit_logs al
               WHERE al.entity_type = 'product'
                 AND al.action = 'import_create'
                 AND al.entity_id = resolved_product_id::text
                 AND al.after_json->>'importJobId' = $1::text
             )
           )
       )
       SELECT p.id::text AS product_id, p.item_no, p.name
       FROM job_products jp
       INNER JOIN products p ON p.id = jp.product_id
       ORDER BY p.name ASC, p.id ASC`,
      jobId,
    );
  }

  private async analyzeProductCleanupCandidate(
    tx: Prisma.TransactionClient,
    jobId: string,
    row: ImportProductCleanupCandidateRow,
  ): Promise<ImportProductCleanupCandidate> {
    const [counts] = await tx.$queryRawUnsafe<ImportProductCleanupCountsRow[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM sale_items WHERE product_id = $1::uuid) AS sales,
         (SELECT COUNT(*)::int FROM sale_return_items WHERE product_id = $1::uuid) AS sale_returns,
         (SELECT COUNT(*)::int FROM purchase_items WHERE product_id = $1::uuid) AS purchases,
         (SELECT COUNT(*)::int FROM stock_transfer_items WHERE product_id = $1::uuid) AS transfers,
         (SELECT COUNT(*)::int
            FROM opening_stock_entries
            WHERE product_id = $1::uuid
              AND import_job_id = $2::uuid
              AND reversed_at IS NULL) AS unreversed_opening_stock,
         (SELECT COUNT(*)::int
            FROM opening_stock_entries
            WHERE product_id = $1::uuid
              AND import_job_id = $2::uuid
              AND reversed_at IS NOT NULL) AS reversed_opening_stock,
         (SELECT COUNT(*)::int
            FROM opening_stock_entries
            WHERE product_id = $1::uuid
              AND (import_job_id IS DISTINCT FROM $2::uuid)) AS other_opening_stock,
         (SELECT COALESCE(SUM(quantity), 0)::int
            FROM inventory
            WHERE product_id = $1::uuid) AS inventory_quantity,
         (SELECT COALESCE(SUM(quantity), 0)::int
            FROM batches
            WHERE product_id = $1::uuid) AS batch_quantity`,
      row.product_id,
      jobId,
    );

    const c = counts ?? {
      sales: 0,
      sale_returns: 0,
      purchases: 0,
      transfers: 0,
      unreversed_opening_stock: 0,
      reversed_opening_stock: 0,
      other_opening_stock: 0,
      inventory_quantity: 0,
      batch_quantity: 0,
    };
    const reasons: string[] = [];
    if (Number(c.sales) > 0) reasons.push('Has sale history');
    if (Number(c.sale_returns) > 0) reasons.push('Has sale return history');
    if (Number(c.purchases) > 0) reasons.push('Has purchase history');
    if (Number(c.transfers) > 0) reasons.push('Has transfer history');
    if (Number(c.unreversed_opening_stock) > 0) {
      reasons.push('Reverse opening stock for this import first');
    }
    if (Number(c.other_opening_stock) > 0) {
      reasons.push('Has opening stock records from another source');
    }
    if (Number(c.inventory_quantity) !== 0) {
      reasons.push(`Remaining inventory quantity is ${c.inventory_quantity}`);
    }
    if (Number(c.batch_quantity) !== 0) {
      reasons.push(`Remaining batch quantity is ${c.batch_quantity}`);
    }

    return {
      productId: row.product_id,
      itemNo: row.item_no,
      name: row.name,
      canDelete: reasons.length === 0,
      reasons,
      counts: {
        sales: Number(c.sales),
        saleReturns: Number(c.sale_returns),
        purchases: Number(c.purchases),
        transfers: Number(c.transfers),
        unreversedOpeningStock: Number(c.unreversed_opening_stock),
        reversedOpeningStock: Number(c.reversed_opening_stock),
        otherOpeningStock: Number(c.other_opening_stock),
        inventoryQuantity: Number(c.inventory_quantity),
        batchQuantity: Number(c.batch_quantity),
      },
    };
  }

  private assertEntriesReversible(entries: OpeningStockEntryRow[]): void {
    for (const entry of entries) {
      const qty = Math.floor(entry.quantity);
      if (Number(entry.batchQuantity) < qty) {
        throw new BadRequestException(
          `Batch for product ${entry.productId} has insufficient quantity (${entry.batchQuantity} available, ${qty} imported). Stock may have been sold or adjusted.`,
        );
      }
      if (entry.branchLockDate) {
        const lockStr = entry.branchLockDate.slice(0, 10);
        if (entry.entryDate <= lockStr) {
          throw new BadRequestException(
            `Opening stock entry date ${entry.entryDate} is on or before accounting lock date ${lockStr}`,
          );
        }
      }
    }
  }

  private async resolveOpeningStockGlSource(
    tx: Prisma.TransactionClient,
    entryId: string,
  ): Promise<
    'product_import_opening_stock' | 'opening_stock_import'
  > {
    const [row] = await tx.$queryRawUnsafe<
      Array<{ source_type: string }>
    >(
      `SELECT source_type FROM journal_entries
       WHERE source_id = $1::uuid
         AND source_type IN ('product_import_opening_stock', 'opening_stock_import')
       ORDER BY created_at DESC
       LIMIT 1`,
      entryId,
    );
    if (row?.source_type === 'product_import_opening_stock') {
      return 'product_import_opening_stock';
    }
    return 'opening_stock_import';
  }

  private async loadUnreversedEntries(
    schemaName: string,
    jobId: string,
  ): Promise<OpeningStockEntryRow[]> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          branch_id: string;
          product_id: string;
          batch_id: string;
          import_job_row_id: string | null;
          quantity: number;
          cost_price: number | string;
          entry_date: string;
          batch_quantity: number | string;
          branch_lock: string | null;
        }>
      >(
        `SELECT ose.id::text AS id,
                ose.branch_id::text AS branch_id,
                ose.product_id::text AS product_id,
                ose.batch_id::text AS batch_id,
                ose.import_job_row_id::text AS import_job_row_id,
                ose.quantity,
                ose.cost_price,
                ose.entry_date::text AS entry_date,
                b.quantity AS batch_quantity,
                br.accounting_lock_date::text AS branch_lock
         FROM opening_stock_entries ose
         INNER JOIN batches b ON b.id = ose.batch_id
         INNER JOIN branches br ON br.id = ose.branch_id
         WHERE ose.import_job_id = $1::uuid
           AND ose.reversed_at IS NULL
         ORDER BY ose.created_at ASC`,
        jobId,
      );
      return rows.map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        productId: r.product_id,
        batchId: r.batch_id,
        importJobRowId: r.import_job_row_id,
        quantity: Number(r.quantity),
        costPrice: Number(r.cost_price ?? 0),
        entryDate: r.entry_date.slice(0, 10),
        batchQuantity: Number(r.batch_quantity),
        branchLockDate: r.branch_lock,
      }));
    });
  }
}
