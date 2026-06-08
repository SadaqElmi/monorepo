import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'node:path';
import { Prisma } from '@prisma/client';
import { CacheInvalidationService } from '../../cache/cache-invalidation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../accounting/audit-log.service';
import { UomsService } from '../../uoms/uoms.service';
import { ImportHandler } from './import-handler.interface';
import { ImportJobsService } from '../import-jobs.service';
import {
  ImportParserService,
  PRODUCT_IMPORT_HEADERS,
} from '../import-parser.service';
import { ImportProgressService } from '../import-progress.service';
import type {
  CommitChunkResult,
  ImportContext,
  ImportJobRow,
  ImportJobSummary,
  ImportPreviewResponse,
  ImportRowValidationResult,
  ImportValidationIssue,
  ParsedProductImportRow,
  ProductImportRowAction,
} from '../types/import.types';

type LookupMaps = {
  productsByItemNo: Map<
    string,
    { id: string; name: string; barcode: string | null }
  >;
  productsByBarcode: Map<
    string,
    { id: string; name: string; itemNo: string | null }
  >;
  duplicateBarcodes: Set<string>;
  categoriesByPath: Map<string, string>;
};

type FileIntegrityMaps = {
  itemNoProductFieldValues: Map<string, Map<string, Set<string>>>;
  itemNoRowCounts: Map<string, number>;
  barcodeItemNos: Map<string, Set<string>>;
};

import { COMMIT_CHUNK } from './import-commit.constants';
const VALIDATE_CHUNK = 1000;

@Injectable()
export class ProductImportHandler implements ImportHandler {
  readonly importType = 'product';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ImportJobsService,
    private readonly parser: ImportParserService,
    private readonly progress: ImportProgressService,
    private readonly auditLog: AuditLogService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly uomsService: UomsService,
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
      await this.parser.parseProductImportBuffer(fileBuffer);
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
    void ctx;
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) throw new NotFoundException('Import job not found');

    await this.jobs.updateStatus(schemaName, jobId, 'validating');
    await this.progress.set(jobId, {
      phase: 'validating',
      processed: 0,
      total: job.totalRows,
    });

    const lookups = await this.buildLookups(schemaName);
    const fileIntegrity = await this.buildFileIntegrityMaps(schemaName, jobId);

    let page = 1;
    const pageSize = VALIDATE_CHUNK;
    let processed = 0;
    const summary: ImportJobSummary = {
      totalRows: job.totalRows,
      errorRows: 0,
      warningRows: 0,
      createProducts: 0,
      updateProducts: 0,
      skipRows: 0,
    };

    while (true) {
      const { rows, total } = await this.jobs.getJobRows(
        schemaName,
        jobId,
        page,
        pageSize,
      );
      if (!rows.length) break;

      for (const row of rows) {
        const parsed = this.parser.parseProductRawRow(row.rawData);
        const vr = parsed
          ? this.validateRow(parsed, row.rowNumber, lookups, fileIntegrity)
          : {
              errors: [
                {
                  code: 'EMPTY_ROW',
                  message: `Row ${row.rowNumber}: empty or invalid row`,
                  severity: 'error' as const,
                },
              ],
              warnings: [],
              action: 'skip' as ProductImportRowAction,
            };

        await this.jobs.updateRowValidation(schemaName, row.id, parsed, vr);

        if (vr.errors.length) summary.errorRows += 1;
        else if (vr.warnings.length) summary.warningRows += 1;
        if (vr.action === 'create_product') summary.createProducts! += 1;
        else if (vr.action === 'update_product') summary.updateProducts! += 1;
        else if (vr.action === 'skip') summary.skipRows += 1;

        processed += 1;
      }

      await this.progress.set(jobId, {
        phase: 'validating',
        processed,
        total: job.totalRows,
      });
      if (page * pageSize >= total) break;
      page += 1;
    }

    const finalStatus = summary.errorRows > 0 ? 'failed' : 'preview';
    await this.jobs.updateStatus(schemaName, jobId, finalStatus, {
      summary,
      processedRows: processed,
    });
    await this.progress.set(jobId, {
      phase: finalStatus,
      processed,
      total: job.totalRows,
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
        createProducts: 0,
        updateProducts: 0,
        skipRows: 0,
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

    const categoryCache = new Map<string, string>();
    const productCache = new Map<string, string>();
    let committed = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const parsed = row.parsedData as ParsedProductImportRow;
        await this.prisma.withTenantSchema(schemaName, async (tx) => {
          const productId = await this.upsertProductForRow(
            tx,
            ctx,
            jobId,
            parsed,
            row.validationResult,
            categoryCache,
            productCache,
          );

          await tx.$executeRawUnsafe(
            `UPDATE import_job_rows SET
               commit_status = 'committed',
               resolved_product_id = $2::uuid
             WHERE id = $1::uuid`,
            row.id,
            productId,
          );
        });
        committed += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        await this.jobs.markRowFailed(schemaName, row.id, msg);
      }
    }

    if (committed > 0) {
      await this.cacheInvalidation.invalidateCatalogForBranches(
        ctx.tenantId,
        [],
      );
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
    const headers = [
      ...PRODUCT_IMPORT_HEADERS,
      'error_codes',
      'error_messages',
      'warning_messages',
      'action',
    ];
    sheet.addRow(headers);
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
        if (!this.rowHasExportableIssues(r)) continue;
        const vr = r.validationResult;
        sheet.addRow([
          ...PRODUCT_IMPORT_HEADERS.map((h) => exportCellValue(r, h)),
          [...(vr?.errors ?? []).map((e) => e.code), ...(r.commitStatus === 'failed' && r.commitError ? ['COMMIT_FAILED'] : [])].join('; '),
          [...(vr?.errors ?? []).map((e) => e.message), ...(r.commitStatus === 'failed' && r.commitError ? [r.commitError] : [])].join('; '),
          (vr?.warnings ?? []).map((w) => w.message).join('; '),
          vr?.action ?? '',
        ]);
      }
      if (page * 500 >= total) break;
      page += 1;
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private rowHasExportableIssues(row: ImportJobRow): boolean {
    const vr = row.validationResult;
    if (vr?.errors?.length || vr?.warnings?.length) return true;
    return row.commitStatus === 'failed' && Boolean(row.commitError);
  }

  private async buildLookups(schemaName: string): Promise<LookupMaps> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const products = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          item_no: string | null;
          barcode: string | null;
          name: string;
        }>
      >(`SELECT id::text AS id, item_no, barcode, name FROM products`);
      const categories = await tx.$queryRawUnsafe<
        Array<{ id: string; name: string; parent_id: string | null }>
      >(
        `SELECT id::text AS id, name, parent_id::text AS parent_id FROM product_categories`,
      );

      const productsByItemNo = new Map<
        string,
        { id: string; name: string; barcode: string | null }
      >();
      const productsByBarcode = new Map<
        string,
        { id: string; name: string; itemNo: string | null }
      >();
      const duplicateBarcodes = new Set<string>();

      for (const p of products) {
        if (p.item_no?.trim()) {
          productsByItemNo.set(p.item_no.trim(), {
            id: p.id,
            name: p.name,
            barcode: p.barcode,
          });
        }
        if (p.barcode?.trim()) {
          const barcode = p.barcode.trim();
          if (productsByBarcode.has(barcode)) {
            duplicateBarcodes.add(barcode);
            productsByBarcode.delete(barcode);
          } else if (!duplicateBarcodes.has(barcode)) {
            productsByBarcode.set(barcode, {
              id: p.id,
              name: p.name,
              itemNo: p.item_no,
            });
          }
        }
      }

      return {
        productsByItemNo,
        productsByBarcode,
        duplicateBarcodes,
        categoriesByPath: this.buildCategoryPathMap(categories),
      };
    });
  }

  private buildCategoryPathMap(
    categories: Array<{ id: string; name: string; parent_id: string | null }>,
  ): Map<string, string> {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const pathFor = (id: string): string => {
      const parts: string[] = [];
      let cur = byId.get(id);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        parts.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      return parts.join(' > ');
    };
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(pathFor(c.id).toLowerCase(), c.id);
    }
    return map;
  }

  private async buildFileIntegrityMaps(
    schemaName: string,
    jobId: string,
  ): Promise<FileIntegrityMaps> {
    const itemNoProductFieldValues = new Map<
      string,
      Map<string, Set<string>>
    >();
    const itemNoRowCounts = new Map<string, number>();
    const barcodeItemNos = new Map<string, Set<string>>();
    let page = 1;
    while (true) {
      const { rows, total } = await this.jobs.getJobRows(
        schemaName,
        jobId,
        page,
        1000,
      );
      if (!rows.length) break;
      for (const r of rows) {
        const parsed = this.parser.parseProductRawRow(r.rawData);
        if (!parsed?.itemNo) continue;
        itemNoRowCounts.set(
          parsed.itemNo,
          (itemNoRowCounts.get(parsed.itemNo) ?? 0) + 1,
        );
        this.trackItemNoProductFields(itemNoProductFieldValues, parsed);
        if (parsed.barcode) {
          const set = barcodeItemNos.get(parsed.barcode) ?? new Set<string>();
          set.add(parsed.itemNo);
          barcodeItemNos.set(parsed.barcode, set);
        }
      }
      if (page * 1000 >= total) break;
      page += 1;
    }
    return { itemNoProductFieldValues, itemNoRowCounts, barcodeItemNos };
  }

  private trackItemNoProductFields(
    fieldValues: Map<string, Map<string, Set<string>>>,
    row: ParsedProductImportRow,
  ): void {
    const fields: Array<[string, string | number | null]> = [
      ['name', row.name],
      ['barcode', row.barcode],
      ['generic_name', row.genericName],
      ['strength', row.strength],
      ['formulation', row.formulation],
      ['category_path', row.categoryPath],
      ['unit', row.unit],
      ['purchase_uom', row.purchaseUom ?? null],
      ['sales_uom', row.salesUom ?? null],
      ['pos_uom', row.posUom ?? null],
      ['strip_factor', row.stripFactor ?? null],
      ['box_factor', row.boxFactor ?? null],
      ['carton_factor', row.cartonFactor ?? null],
    ];
    const valuesByField =
      fieldValues.get(row.itemNo) ?? new Map<string, Set<string>>();
    for (const [field, value] of fields) {
      const normalized = this.normalizeImportFieldValue(value);
      if (normalized == null) continue;
      const values = valuesByField.get(field) ?? new Set<string>();
      values.add(normalized);
      valuesByField.set(field, values);
    }
    fieldValues.set(row.itemNo, valuesByField);
  }

  private normalizeImportFieldValue(
    value: string | number | null,
  ): string | null {
    if (value == null) return null;
    const text =
      typeof value === 'number'
        ? value.toFixed(6).replace(/\.?0+$/, '')
        : String(value);
    const normalized = text.trim().toLowerCase();
    return normalized ? normalized : null;
  }

  private validateRow(
    row: ParsedProductImportRow,
    rowNumber: number,
    lookups: LookupMaps,
    fileIntegrity: FileIntegrityMaps,
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
    if (!row.name?.trim()) {
      errors.push({
        code: 'NAME_REQUIRED',
        message: `Row ${rowNumber}: name is required`,
        severity: 'error',
      });
    }

    const duplicateItemNoCount =
      fileIntegrity.itemNoRowCounts?.get(row.itemNo) ?? 0;
    if (duplicateItemNoCount > 1) {
      errors.push({
        code: 'DUPLICATE_ITEM_NO',
        message: `Row ${rowNumber}: duplicate item_no "${row.itemNo}" in file`,
        severity: 'error',
      });
    }

    const productFieldValues =
      fileIntegrity.itemNoProductFieldValues?.get(row.itemNo) ??
      new Map<string, Set<string>>();
    for (const [field, values] of productFieldValues.entries()) {
      if (values.size > 1) {
        errors.push({
          code: 'ITEM_NO_CONFLICT',
          message: `Row ${rowNumber}: item_no "${row.itemNo}" has conflicting ${field} values in file`,
          severity: 'error',
        });
      }
    }

    if (row.barcode) {
      const itemNos = fileIntegrity.barcodeItemNos?.get(row.barcode);
      if (itemNos && itemNos.size > 1) {
        errors.push({
          code: 'BARCODE_DUPLICATE_IN_FILE',
          message: `Row ${rowNumber}: barcode "${row.barcode}" used for different item_no values in file`,
          severity: 'error',
        });
      }
      if (lookups.duplicateBarcodes.has(row.barcode)) {
        errors.push({
          code: 'BARCODE_NOT_UNIQUE_IN_DB',
          message: `Row ${rowNumber}: barcode "${row.barcode}" is not unique in the tenant catalog`,
          severity: 'error',
        });
      }
    }

    for (const [label, value] of [
      ['strip_factor', row.stripFactor],
      ['box_factor', row.boxFactor],
      ['carton_factor', row.cartonFactor],
    ] as const) {
      if (value != null && (!Number.isFinite(value) || value <= 0)) {
        errors.push({
          code: 'INVALID_UOM_FACTOR',
          message: `Row ${rowNumber}: ${label} must be greater than 0`,
          severity: 'error',
        });
      }
    }

    let matchedProductId: string | null = null;
    let action: ProductImportRowAction = 'create_product';

    if (row.itemNo && lookups.productsByItemNo.has(row.itemNo)) {
      matchedProductId = lookups.productsByItemNo.get(row.itemNo)!.id;
      action = 'update_product';
    } else if (
      row.barcode &&
      !lookups.duplicateBarcodes.has(row.barcode) &&
      lookups.productsByBarcode.has(row.barcode)
    ) {
      const p = lookups.productsByBarcode.get(row.barcode)!;
      if (row.itemNo && p.itemNo && p.itemNo !== row.itemNo) {
        errors.push({
          code: 'BARCODE_ALREADY_EXISTS',
          message: `Row ${rowNumber}: barcode already assigned to another product`,
          severity: 'error',
        });
      } else {
        matchedProductId = p.id;
        action = 'update_product';
      }
    }

    if (row.categoryPath?.trim()) {
      const key = row.categoryPath.trim().toLowerCase();
      if (!lookups.categoriesByPath.has(key)) {
        warnings.push({
          code: 'CATEGORY_WILL_CREATE',
          message: `Row ${rowNumber}: category "${row.categoryPath}" will be created during import`,
          severity: 'warning',
        });
      }
    }

    if (errors.length) action = 'skip';

    return {
      errors,
      warnings,
      action,
      matchedProductId,
      willCreateCategory: row.categoryPath
        ? !lookups.categoriesByPath.has(row.categoryPath.trim().toLowerCase())
        : false,
    };
  }

  private async upsertProductForRow(
    tx: Prisma.TransactionClient,
    ctx: ImportContext,
    jobId: string,
    row: ParsedProductImportRow,
    vr: ImportRowValidationResult,
    categoryCache: Map<string, string>,
    productCache: Map<string, string>,
  ): Promise<string> {
    const cacheKey = row.itemNo;
    if (productCache.has(cacheKey)) return productCache.get(cacheKey)!;

    let categoryId: string | null = null;
    if (row.categoryPath?.trim()) {
      categoryId = await this.resolveCategory(
        tx,
        row.categoryPath.trim(),
        categoryCache,
      );
    }

    let existingId = vr.matchedProductId;
    if (!existingId && row.itemNo) {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text AS id FROM products WHERE item_no = $1 ORDER BY created_at ASC LIMIT 2`,
        row.itemNo,
      );
      if (rows.length > 1) {
        throw new BadRequestException(
          `item_no "${row.itemNo}" already has multiple products`,
        );
      }
      existingId = rows[0]?.id ?? null;
    }

    if (existingId) {
      await tx.$executeRawUnsafe(
        `UPDATE products SET
           name = $2,
           item_no = COALESCE($3, item_no),
           generic_name = COALESCE($4, generic_name),
           barcode = COALESCE($5, barcode),
           category_id = COALESCE($6::uuid, category_id),
           unit = COALESCE($7, unit),
           strength = COALESCE($8, strength),
           formulation = COALESCE($9, formulation),
           description = COALESCE($10, description)
         WHERE id = $1::uuid`,
        existingId,
        row.name,
        row.itemNo,
        row.genericName,
        row.barcode,
        categoryId,
        row.unit,
        row.strength,
        row.formulation,
        row.description,
      );
      await this.uomsService.syncLegacyUnitForProductInTx(
        tx,
        existingId,
        row.unit,
      );
      await this.uomsService.syncBaseUomMetadataForProductInTx(tx, existingId, {
        listPrice: row.pcsPrice ?? undefined,
      });
      await this.syncImportedUomConversionsInTx(tx, existingId, row);
      await this.auditLog.append(tx, {
        branchId: null,
        actorUserId: ctx.userId,
        tableName: 'products',
        recordId: existingId,
        action: 'import_update',
        entityType: 'product',
        entityId: existingId,
        newPayload: { importJobId: jobId, itemNo: row.itemNo, name: row.name },
      });
      productCache.set(cacheKey, existingId);
      return existingId;
    }

    try {
      const [created] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO products (branch_id, item_no, name, generic_name, barcode, category_id, unit, strength, formulation, description)
         VALUES (NULL, $1, $2, $3, $4, $5::uuid, $6, $7, $8, $9)
         RETURNING id::text AS id`,
        row.itemNo,
        row.name,
        row.genericName,
        row.barcode,
        categoryId,
        row.unit,
        row.strength,
        row.formulation,
        row.description,
      );
      if (!created) throw new Error('Failed to create product');

      await this.uomsService.ensureBaseUomForProductInTx(
        tx,
        created.id,
        row.unit,
        {
          listPrice: row.pcsPrice ?? null,
        },
      );
      await this.syncImportedUomConversionsInTx(tx, created.id, row);

      await this.auditLog.append(tx, {
        branchId: null,
        actorUserId: ctx.userId,
        tableName: 'products',
        recordId: created.id,
        action: 'import_create',
        entityType: 'product',
        entityId: created.id,
        newPayload: { importJobId: jobId, itemNo: row.itemNo, name: row.name },
      });

      productCache.set(cacheKey, created.id);
      return created.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('products_barcode_unique') || msg.includes('unique')) {
        throw new BadRequestException(
          `Barcode "${row.barcode}" already exists for another product`,
        );
      }
      if (msg.includes('products_item_no_unique')) {
        throw new BadRequestException(`item_no "${row.itemNo}" already exists`);
      }
      throw e;
    }
  }

  private async syncImportedUomConversionsInTx(
    tx: Prisma.TransactionClient,
    productId: string,
    row: ParsedProductImportRow,
  ): Promise<void> {
    const normalizeDefault = (value?: string | null): string | null => {
      const raw = value?.trim().toUpperCase();
      if (!raw) return null;
      if (['PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH'].includes(raw)) return 'PCS';
      if (['TAB', 'TABS', 'TABLET', 'TABLETS'].includes(raw)) return 'TAB';
      if (['STRIP', 'STRIPS'].includes(raw)) return 'STRIP';
      if (['BOX', 'BOXES'].includes(raw)) return 'BOX';
      if (['CTN', 'CARTON', 'CARTONS'].includes(raw)) return 'CTN';
      if (['BTL', 'BOTTLE', 'BOTTLES'].includes(raw)) return 'BTL';
      return raw;
    };
    const purchaseDefault = normalizeDefault(row.purchaseUom);
    const salesDefault = normalizeDefault(row.salesUom);
    const posDefault = normalizeDefault(row.posUom);
    const conversions = [
      {
        code: 'STRIP',
        factor: row.stripFactor,
        sellingPrice: row.stripPrice,
        barcode: row.stripBarcode,
      },
      {
        code: 'BOX',
        factor: row.boxFactor,
        sellingPrice: row.boxPrice,
        barcode: row.boxBarcode,
      },
      {
        code: 'CTN',
        factor: row.cartonFactor,
        sellingPrice: null,
        barcode: null,
      },
    ];

    for (const c of conversions) {
      if (c.factor == null) continue;
      await this.uomsService.upsertProductUomByCodeInTx(tx, productId, {
        code: c.code,
        factor: c.factor,
        isPurchaseDefault: purchaseDefault === c.code,
        isSalesDefault: salesDefault === c.code,
        isPosDefault: posDefault === c.code,
        sellingPrice: c.sellingPrice ?? null,
      });
    }
  }

  private async findOrCreateCategoryPart(
    tx: Prisma.TransactionClient,
    part: string,
    parentId: string | null,
  ): Promise<string | null> {
    const existingRows: Array<{ id: string }> = await tx.$queryRawUnsafe(
      `SELECT id::text AS id FROM product_categories
       WHERE LOWER(name) = LOWER($1)
         AND (($2::uuid IS NULL AND parent_id IS NULL) OR parent_id = $2::uuid)
       LIMIT 1`,
      part,
      parentId,
    );
    if (existingRows[0]?.id) return existingRows[0].id;

    const createdRows: Array<{ id: string }> = await tx.$queryRawUnsafe(
      `INSERT INTO product_categories (branch_id, name, parent_id)
       VALUES (NULL, $1, $2::uuid)
       RETURNING id::text AS id`,
      part,
      parentId,
    );
    return createdRows[0]?.id ?? null;
  }

  private async resolveCategory(
    tx: Prisma.TransactionClient,
    categoryPath: string,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const parts = categoryPath
      .split('>')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return null;

    let parentId: string | null = null;
    let lastId: string | null = null;

    for (let i = 0; i < parts.length; i++) {
      const pathKey = parts
        .slice(0, i + 1)
        .join(' > ')
        .toLowerCase();
      if (cache.has(pathKey)) {
        lastId = cache.get(pathKey)!;
        parentId = lastId;
        continue;
      }
      const partId = await this.findOrCreateCategoryPart(
        tx,
        parts[i],
        parentId,
      );
      lastId = partId;
      if (lastId) {
        cache.set(pathKey, lastId);
        parentId = lastId;
      }
    }
    return lastId;
  }
}

function exportCellValue(
  row: ImportJobRow,
  header: (typeof PRODUCT_IMPORT_HEADERS)[number],
): string | number {
  const raw = row.rawData[header];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  const parsed = row.parsedData as ParsedProductImportRow | null;
  if (!parsed) return '';
  const map: Record<string, keyof ParsedProductImportRow> = {
    item_no: 'itemNo',
    barcode: 'barcode',
    name: 'name',
    generic_name: 'genericName',
    strength: 'strength',
    formulation: 'formulation',
    category_path: 'categoryPath',
    base_uom: 'unit',
    unit: 'unit',
    purchase_uom: 'purchaseUom',
    sales_uom: 'salesUom',
    pos_uom: 'posUom',
    strip_factor: 'stripFactor',
    box_factor: 'boxFactor',
    carton_factor: 'cartonFactor',
    pcs_price: 'pcsPrice',
    strip_price: 'stripPrice',
    box_price: 'boxPrice',
    pcs_barcode: 'pcsBarcode',
    strip_barcode: 'stripBarcode',
    box_barcode: 'boxBarcode',
    description: 'description',
  };
  const field = map[header];
  if (!field) return '';
  const value = parsed[field];
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'string') return value;
  return '';
}
