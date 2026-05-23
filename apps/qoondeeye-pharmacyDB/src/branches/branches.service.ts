import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { queryInterbranchMismatches } from '../accounting/interbranch-report.util';
import { resolveCatalogCacheTtlMs } from '../cache/cache-catalog.config';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { catalogListCacheKey } from '../cache/cache-keys';
import { catalogTenantTags } from '../cache/cache-tags';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

export interface BranchRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  /** Omitted on some INSERT … RETURNING projections; present on full row reads. */
  accounting_lock_date?: Date | string | null;
  created_at: Date;
}

@Injectable()
export class BranchesService {
  private readonly catalogTtlMs = resolveCatalogCacheTtlMs();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly taggedCache: TaggedCacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async findAll(schemaName: string, tenantId: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const key = catalogListCacheKey(tenantId, 'all', 'branches');
    const tags = catalogTenantTags(tenantId);
    return this.taggedCache.getOrSet(
      key,
      tags,
      this.catalogTtlMs,
      () =>
        this.prisma.withTenantSchema(schemaName, (tx) =>
          tx.$queryRawUnsafe<BranchRow[]>(
            `SELECT id, name, phone, address, accounting_lock_date, created_at FROM branches ORDER BY name`,
          ),
        ),
    );
  }

  async findOne(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<BranchRow[]>(
        `SELECT id, name, phone, address, accounting_lock_date, created_at FROM branches WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    tenantId: string,
    dto: { name?: string; phone?: string; address?: string },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<BranchRow[]>(
        `INSERT INTO branches (name, phone, address) VALUES ($1, $2, $3) RETURNING id, name, phone, address, created_at`,
        dto.name ?? null,
        dto.phone ?? null,
        dto.address ?? null,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory (product_id, branch_id, quantity, reorder_level)
         SELECT p.id, $1::uuid, 0, 10
         FROM products p
         ON CONFLICT (product_id, branch_id) DO NOTHING`,
        row.id,
      );
      return row;
    });
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return row;
  }

  async update(
    schemaName: string,
    tenantId: string,
    id: string,
    dto: {
      name?: string;
      phone?: string;
      address?: string;
      accountingLockDate?: string | null;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const skipLock = dto.accountingLockDate === undefined;
      const rawLock = dto.accountingLockDate;
      const lockDate =
        skipLock || rawLock === null || rawLock === ''
          ? null
          : String(rawLock).trim().slice(0, 10);
      if (!skipLock && lockDate) {
        const blockCritical =
          (process.env.INTERBRANCH_LOCK_BLOCK_ON_CRITICAL ?? '')
            .trim()
            .toLowerCase() === 'true' ||
          process.env.INTERBRANCH_LOCK_BLOCK_ON_CRITICAL === '1';
        if (blockCritical) {
          const branchRows = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id::text AS id FROM branches`,
          );
          const ids = (branchRows ?? []).map((r) => r.id).filter(Boolean);
          if (ids.length > 1) {
            const mismatches = await queryInterbranchMismatches(tx, ids);
            const critical = mismatches.filter((m) => m.kind !== 'in_transit');
            const [negativeInventory] = await tx.$queryRawUnsafe<
              Array<{ c: number }>
            >(
              `SELECT COUNT(*)::int AS c
               FROM inventory
               WHERE branch_id = ANY($1::uuid[])
                 AND quantity < 0`,
              ids,
            );
            const [transferCritical] = await tx.$queryRawUnsafe<
              Array<{ c: number }>
            >(
              `SELECT COUNT(*)::int AS c
               FROM stock_transfers st
               WHERE st.from_branch_id = ANY($1::uuid[])
                 AND st.to_branch_id = ANY($1::uuid[])
                 AND lower(COALESCE(st.status, '')) IN ('shipped', 'received', 'closed')
                 AND st.is_reversed = false
                 AND (
                   (st.ship_accounting_state = 'failed')
                   OR (st.receive_accounting_state = 'failed')
                   OR (st.shipped_journal_entry_id IS NULL)
                   OR (
                     lower(COALESCE(st.status, '')) IN ('received', 'closed')
                     AND st.receive_journal_entry_id IS NULL
                   )
                 )`,
              ids,
            );
            if (
              critical.length ||
              Number(negativeInventory?.c ?? 0) > 0 ||
              Number(transferCritical?.c ?? 0) > 0
            ) {
              throw new BadRequestException(
                `Cannot set accounting lock date while close-readiness is critical (inter-branch mismatch: ${critical.length}, negative inventory: ${Number(negativeInventory?.c ?? 0)}, transfer posting issues: ${Number(transferCritical?.c ?? 0)}). Resolve blockers first, or set INTERBRANCH_LOCK_BLOCK_ON_CRITICAL=0 to allow.`,
              );
            }
          }
        }
      }
      const [row] = await tx.$queryRawUnsafe<BranchRow[]>(
        `UPDATE branches SET
           name = COALESCE($2, name),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           accounting_lock_date = CASE WHEN $5::boolean THEN accounting_lock_date ELSE $6::date END
         WHERE id = $1
         RETURNING id, name, phone, address, accounting_lock_date, created_at`,
        id,
        dto.name ?? null,
        dto.phone ?? null,
        dto.address ?? null,
        skipLock,
        skipLock ? null : lockDate,
      );
      return row ?? null;
    });
    await this.cacheInvalidation.invalidateCatalogTenant(tenantId);
    return row;
  }

  /**
   * Hard-delete a branch and tenant-scoped rows that reference it, in FK-safe order.
   * Refuses when this would remove the tenant's last branch.
   */
  async remove(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [branchRow] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM branches WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!branchRow) {
        throw new NotFoundException(`Branch not found: ${id}`);
      }

      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM branches`,
      );
      if (!countRow || Number(countRow.c) <= 1) {
        throw new BadRequestException(
          'Cannot delete the last remaining branch for this tenant.',
        );
      }

      await this.purgeBranchScopedData(tx, schemaName, id);

      const deleted = await tx.$executeRawUnsafe(
        `DELETE FROM branches WHERE id = $1::uuid`,
        id,
      );
      if (Number(deleted) !== 1) {
        throw new ConflictException(
          'Branch could not be deleted because dependent data could not be fully removed.',
        );
      }

      return { deleted: true };
    });
  }

  private async tableExists(
    tx: Prisma.TransactionClient,
    schemaName: string,
    tableName: string,
  ): Promise<boolean> {
    const [r] = await tx.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = $1 AND t.table_name = $2
      ) AS ok`,
      schemaName,
      tableName,
    );
    return Boolean(r?.ok);
  }

  private async execIfTableExists(
    tx: Prisma.TransactionClient,
    schemaName: string,
    tableName: string,
    sql: string,
    branchId: string,
  ): Promise<void> {
    if (await this.tableExists(tx, schemaName, tableName)) {
      await tx.$executeRawUnsafe(sql, branchId);
    }
  }

  private async purgeBranchScopedData(
    tx: Prisma.TransactionClient,
    schemaName: string,
    branchId: string,
  ): Promise<void> {
    await this.execIfTableExists(
      tx,
      schemaName,
      'stock_transfers',
      `UPDATE stock_transfers SET
         shipped_journal_entry_id = NULL,
         receive_journal_entry_id = NULL,
         ship_reversal_journal_entry_id = NULL,
         receive_reversal_journal_entry_id = NULL
       WHERE from_branch_id = $1::uuid OR to_branch_id = $1::uuid`,
      branchId,
    );
    await this.execIfTableExists(
      tx,
      schemaName,
      'stock_transfers',
      `DELETE FROM stock_transfers
       WHERE from_branch_id = $1::uuid OR to_branch_id = $1::uuid`,
      branchId,
    );

    if (await this.tableExists(tx, schemaName, 'journal_entries')) {
      await tx.$executeRawUnsafe(
        `DELETE FROM journal_entries WHERE branch_id = $1::uuid`,
        branchId,
      );
    }

    await tx.$executeRawUnsafe(
      `DELETE FROM payments
       WHERE sale_id IN (SELECT id FROM sales WHERE branch_id = $1::uuid)`,
      branchId,
    );

    await this.execIfTableExists(
      tx,
      schemaName,
      'customer_payments',
      `DELETE FROM customer_payments WHERE branch_id = $1::uuid`,
      branchId,
    );

    await this.execIfTableExists(
      tx,
      schemaName,
      'purchase_refunds',
      `DELETE FROM purchase_refunds WHERE branch_id = $1::uuid`,
      branchId,
    );

    await this.execIfTableExists(
      tx,
      schemaName,
      'return_vouchers',
      `DELETE FROM return_vouchers WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM sales WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM purchases WHERE branch_id = $1::uuid`,
      branchId,
    );

    await this.execIfTableExists(
      tx,
      schemaName,
      'supplier_payments',
      `DELETE FROM supplier_payments WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM batches WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM inventory WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM expenses WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM cash_transactions WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `UPDATE patient_loans SET branch_id = NULL WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `UPDATE users SET branch_id = NULL WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `UPDATE products SET branch_id = NULL WHERE branch_id = $1::uuid`,
      branchId,
    );

    await tx.$executeRawUnsafe(
      `UPDATE product_categories SET branch_id = NULL WHERE branch_id = $1::uuid`,
      branchId,
    );

    await this.execIfTableExists(
      tx,
      schemaName,
      'audit_logs',
      `DELETE FROM audit_logs WHERE branch_id = $1::uuid`,
      branchId,
    );

    await this.execIfTableExists(
      tx,
      schemaName,
      'product_category_gl_map',
      `DELETE FROM product_category_gl_map WHERE branch_id = $1::uuid`,
      branchId,
    );
    await this.execIfTableExists(
      tx,
      schemaName,
      'online_payment_providers',
      `DELETE FROM online_payment_providers WHERE branch_id = $1::uuid`,
      branchId,
    );
    await this.execIfTableExists(
      tx,
      schemaName,
      'payment_methods_catalog',
      `DELETE FROM payment_methods_catalog WHERE branch_id = $1::uuid`,
      branchId,
    );
    await this.execIfTableExists(
      tx,
      schemaName,
      'follow_up_levels',
      `DELETE FROM follow_up_levels WHERE branch_id = $1::uuid`,
      branchId,
    );
    await this.execIfTableExists(
      tx,
      schemaName,
      'payment_terms',
      `DELETE FROM payment_terms WHERE branch_id = $1::uuid`,
      branchId,
    );
    await this.execIfTableExists(
      tx,
      schemaName,
      'accounting_journal_books',
      `DELETE FROM accounting_journal_books WHERE branch_id = $1::uuid`,
      branchId,
    );

    if (await this.tableExists(tx, schemaName, 'chart_of_accounts')) {
      for (let i = 0; i < 500; i++) {
        const n = await tx.$executeRawUnsafe(
          `DELETE FROM chart_of_accounts ca
           WHERE ca.branch_id = $1::uuid
           AND NOT EXISTS (
             SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = ca.id
           )`,
          branchId,
        );
        if (Number(n) === 0) break;
      }
      const [left] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM chart_of_accounts WHERE branch_id = $1::uuid`,
        branchId,
      );
      if (left && Number(left.c) > 0) {
        throw new ConflictException(
          'Cannot delete branch: chart of accounts rows could not be fully removed (check parent references).',
        );
      }
    }
  }
}
