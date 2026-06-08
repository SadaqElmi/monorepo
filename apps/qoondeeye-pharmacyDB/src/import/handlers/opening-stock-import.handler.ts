import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'node:path';
import { CacheInvalidationService } from '../../cache/cache-invalidation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportHandler } from './import-handler.interface';
import { ImportJobsService } from '../import-jobs.service';
import { ImportProgressService } from '../import-progress.service';
import {
  OpeningStockImportParserService,
  OPENING_STOCK_IMPORT_HEADERS,
} from '../opening-stock-import-parser.service';
import { OpeningStockService } from '../opening-stock/opening-stock.service';
import type {
  CommitChunkResult,
  ImportContext,
  ImportJobRow,
  ImportJobSummary,
  ImportPreviewResponse,
  ImportRowValidationResult,
  ImportValidationIssue,
  ParsedOpeningStockImportRow,
} from '../types/import.types';
import { COMMIT_CHUNK } from './import-commit.constants';

type BranchLookup = Map<string, { id: string; lockDate: string | null }>;
type ProductLookup = Map<string, { id: string; name: string }>;

const VALIDATE_CHUNK = 1000;

@Injectable()
export class OpeningStockImportHandler implements ImportHandler {
  readonly importType = 'opening_stock';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ImportJobsService,
    private readonly parser: OpeningStockImportParserService,
    private readonly progress: ImportProgressService,
    private readonly openingStock: OpeningStockService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  storageDir(): string {
    return path.resolve(process.env.IMPORT_STORAGE_DIR ?? 'tmp/imports');
  }

  async parseAndStage(
    schemaName: string,
    jobId: string,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<{ totalRows: number; fileSha256: string }> {
    void fileName;
    const { rows, fileSha256 } =
      await this.parser.parseOpeningStockImportBuffer(fileBuffer);
    await this.jobs.bulkInsertRows(schemaName, jobId, rows);
    await this.jobs.updateStatus(schemaName, jobId, 'draft', {
      totalRows: rows.length,
    });
    return { totalRows: rows.length, fileSha256 };
  }

  async validate(
    schemaName: string,
    jobId: string,
    ctx: ImportContext,
  ): Promise<void> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) throw new NotFoundException('Import job not found');

    await this.jobs.updateStatus(schemaName, jobId, 'validating');
    await this.progress.set(jobId, {
      phase: 'validating',
      processed: 0,
      total: job.totalRows,
    });

    const { branches, products } = await this.buildLookups(schemaName);

    let page = 1;
    let processed = 0;
    const summary: ImportJobSummary = {
      totalRows: job.totalRows,
      errorRows: 0,
      warningRows: 0,
      skipRows: 0,
      openingStockRows: 0,
    };

    while (true) {
      const { rows, total } = await this.jobs.getJobRows(
        schemaName,
        jobId,
        page,
        VALIDATE_CHUNK,
      );
      if (!rows.length) break;

      for (const row of rows) {
        const parsed = this.parser.parseRawRow(row.rawData);
        const vr = parsed
          ? this.validateRow(parsed, row.rowNumber, ctx, branches, products)
          : {
              errors: [
                {
                  code: 'EMPTY_ROW',
                  message: `Row ${row.rowNumber}: empty or invalid row`,
                  severity: 'error' as const,
                },
              ],
              warnings: [],
              action: 'skip' as const,
            };

        await this.jobs.updateRowValidation(schemaName, row.id, parsed, vr);
        if (vr.errors.length) summary.errorRows += 1;
        else if (vr.warnings.length) summary.warningRows += 1;
        else if (vr.action === 'opening_stock') summary.openingStockRows! += 1;
        else summary.skipRows += 1;
        processed += 1;
      }

      await this.progress.set(jobId, {
        phase: 'validating',
        processed,
        total: job.totalRows,
      });
      if (page * VALIDATE_CHUNK >= total) break;
      page += 1;
    }

    const finalStatus = summary.errorRows > 0 ? 'failed' : 'preview';
    await this.jobs.updateStatus(schemaName, jobId, finalStatus, {
      summary,
      processedRows: processed,
    });
  }

  async buildPreview(
    schemaName: string,
    jobId: string,
    page: number,
    pageSize: number,
  ): Promise<ImportPreviewResponse> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) throw new NotFoundException('Import job not found');
    const { rows, total } = await this.jobs.getJobRows(
      schemaName,
      jobId,
      page,
      pageSize,
    );
    return {
      job,
      summary: job.summary ?? {
        totalRows: job.totalRows,
        errorRows: 0,
        warningRows: 0,
        skipRows: 0,
        openingStockRows: 0,
      },
      rows,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async commitChunk(
    schemaName: string,
    jobId: string,
    ctx: ImportContext,
    offset: number,
    limit: number,
  ): Promise<CommitChunkResult> {
    const rows = await this.jobs.getAllJobRowsForCommit(
      schemaName,
      jobId,
      offset,
      limit,
    );
    if (!rows.length) {
      const pending = await this.jobs.countPendingCommitRows(schemaName, jobId);
      return { processed: 0, committed: 0, failed: 0, done: pending === 0 };
    }

    const affectedBranchIds = new Set<string>();
    let committed = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const parsed = row.parsedData as ParsedOpeningStockImportRow;
        const branchId = row.validationResult.resolvedBranchId!;
        const productId = row.validationResult.matchedProductId!;

        await this.prisma.withTenantSchema(schemaName, async (tx) => {
          affectedBranchIds.add(branchId);
          const batchNumber =
            parsed.batchNumber ??
            (ctx.businessType !== 'pharmacy'
              ? this.openingStock.autoBatchNumber(parsed)
              : null);

          const result = await this.openingStock.createOpeningStock(tx, {
            branchId,
            productId,
            quantity: parsed.openingQty,
            costPrice: parsed.costPrice,
            listPrice: parsed.listPrice ?? 0,
            batchNumber,
            expiryDate: parsed.expiryDate,
            entryDate: parsed.openingDate,
            externalRef: null,
            importJobId: jobId,
            importJobRowId: row.id,
            userId: ctx.userId,
            glSourceType: 'opening_stock_import',
          });

          await tx.$executeRawUnsafe(
            `UPDATE import_job_rows SET
               commit_status = 'committed',
               resolved_product_id = $2::uuid,
               resolved_batch_id = $3::uuid,
               opening_stock_record_id = $4::uuid
             WHERE id = $1::uuid`,
            row.id,
            productId,
            result.batchId,
            result.openingStockEntryId,
          );
        });
        committed += 1;
      } catch (e) {
        failed += 1;
        await this.jobs.markRowFailed(
          schemaName,
          row.id,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    if (affectedBranchIds.size) {
      const branchList = [...affectedBranchIds];
      await this.cacheInvalidation.invalidateCatalogForBranches(
        ctx.tenantId,
        branchList,
      );
      await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
        schemaName,
        tenantId: ctx.tenantId,
        branchIds: branchList,
      });
    }

    const pending = await this.jobs.countPendingCommitRows(schemaName, jobId);
    return {
      processed: rows.length,
      committed,
      failed,
      done: pending === 0,
    };
  }

  async generateErrorExport(
    schemaName: string,
    jobId: string,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Import_Errors');
    sheet.addRow([
      ...OPENING_STOCK_IMPORT_HEADERS,
      'error_codes',
      'error_messages',
      'warning_messages',
      'action',
    ]);
    sheet.getRow(1).font = { bold: true };

    let page = 1;
    while (true) {
      const { rows, total } = await this.jobs.getJobRows(
        schemaName,
        jobId,
        page,
        500,
      );
      if (!rows.length) break;
      for (const r of rows) {
        const vr = r.validationResult;
        if (!vr?.errors?.length && !vr?.warnings?.length && r.commitStatus !== 'failed') {
          continue;
        }
        sheet.addRow([
          ...OPENING_STOCK_IMPORT_HEADERS.map((h) => r.rawData[h] ?? ''),
          (vr?.errors ?? []).map((e) => e.code).join('; '),
          (vr?.errors ?? []).map((e) => e.message).join('; '),
          (vr?.warnings ?? []).map((w) => w.message).join('; '),
          vr?.action ?? '',
        ]);
      }
      if (page * 500 >= total) break;
      page += 1;
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async buildLookups(schemaName: string): Promise<{
    branches: BranchLookup;
    products: ProductLookup;
  }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const branchRows = await tx.$queryRawUnsafe<
        Array<{ id: string; code: string | null; lock: string | null }>
      >(
        `SELECT id::text AS id, code, accounting_lock_date::text AS lock FROM branches`,
      );
      const productRows = await tx.$queryRawUnsafe<
        Array<{ id: string; item_no: string | null; name: string }>
      >(`SELECT id::text AS id, item_no, name FROM products`);

      const branches: BranchLookup = new Map();
      for (const b of branchRows) {
        if (b.code?.trim()) {
          branches.set(b.code.trim().toUpperCase(), {
            id: b.id,
            lockDate: b.lock,
          });
        }
      }

      const products: ProductLookup = new Map();
      for (const p of productRows) {
        if (p.item_no?.trim()) {
          products.set(p.item_no.trim(), { id: p.id, name: p.name });
        }
      }

      return { branches, products };
    });
  }

  private validateRow(
    row: ParsedOpeningStockImportRow,
    rowNumber: number,
    ctx: ImportContext,
    branches: BranchLookup,
    products: ProductLookup,
  ): ImportRowValidationResult {
    const errors: ImportValidationIssue[] = [];
    const warnings: ImportValidationIssue[] = [];

    if (!row.itemNo?.trim()) {
      errors.push({
        code: 'ITEM_NO_REQUIRED',
        message: `Row ${rowNumber}: item_no is required`,
        severity: 'error',
      });
    }
    if (!row.branchCode?.trim()) {
      errors.push({
        code: 'BRANCH_REQUIRED',
        message: `Row ${rowNumber}: branch_code is required`,
        severity: 'error',
      });
    }
    if (row.openingQty <= 0) {
      errors.push({
        code: 'OPENING_QTY_REQUIRED',
        message: `Row ${rowNumber}: opening_qty must be greater than zero`,
        severity: 'error',
      });
    }
    if (row.costPrice == null || row.costPrice < 0) {
      errors.push({
        code: 'COST_PRICE_REQUIRED',
        message: `Row ${rowNumber}: cost_price is required`,
        severity: 'error',
      });
    }
    if (!row.openingDate) {
      errors.push({
        code: 'OPENING_DATE_REQUIRED',
        message: `Row ${rowNumber}: opening_date is required`,
        severity: 'error',
      });
    }

    let resolvedBranchId: string | null = null;
    if (row.branchCode?.trim()) {
      const branch = branches.get(row.branchCode.trim().toUpperCase());
      if (!branch) {
        errors.push({
          code: 'BRANCH_NOT_FOUND',
          message: `Row ${rowNumber}: branch_code "${row.branchCode}" does not exist`,
          severity: 'error',
        });
      } else {
        resolvedBranchId = branch.id;
        if (
          ctx.allowedBranchIds.length &&
          !ctx.allowedBranchIds.includes(branch.id)
        ) {
          errors.push({
            code: 'BRANCH_ACCESS_DENIED',
            message: `Row ${rowNumber}: no permission for branch "${row.branchCode}"`,
            severity: 'error',
          });
        }
        if (row.openingDate && branch.lockDate) {
          const lockStr = branch.lockDate.slice(0, 10);
          if (row.openingDate <= lockStr) {
            errors.push({
              code: 'LOCK_DATE_BLOCKED',
              message: `Row ${rowNumber}: opening_date ${row.openingDate} is on or before lock date ${lockStr}`,
              severity: 'error',
            });
          }
        }
      }
    }

    let matchedProductId: string | null = null;
    if (row.itemNo?.trim()) {
      const product = products.get(row.itemNo.trim());
      if (!product) {
        errors.push({
          code: 'PRODUCT_NOT_FOUND',
          message: `Row ${rowNumber}: product with item_no "${row.itemNo}" does not exist — import catalog first`,
          severity: 'error',
        });
      } else {
        matchedProductId = product.id;
      }
    }

    if (ctx.businessType === 'pharmacy' && row.openingQty > 0) {
      if (!row.batchNumber?.trim()) {
        errors.push({
          code: 'PHARMACY_BATCH_REQUIRED',
          message: `Row ${rowNumber}: batch_number required (pharmacy tenant)`,
          severity: 'error',
        });
      }
      if (!row.expiryDate) {
        errors.push({
          code: 'PHARMACY_EXPIRY_REQUIRED',
          message: `Row ${rowNumber}: expiry_date required (pharmacy tenant)`,
          severity: 'error',
        });
      }
    }

    const action = errors.length ? 'skip' : 'opening_stock';
    return {
      errors,
      warnings,
      action,
      matchedProductId,
      resolvedBranchId,
    };
  }
}
