import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantIdBySchemaName } from '../tenant/tenant-control.repository';
import {
  branchStatsBranchTags,
  catalogBranchTags,
  catalogTenantTags,
  financialBranchTags,
  reconciliationTenantTags,
} from './cache-tags';
import { TaggedCacheService } from './tagged-cache.service';

/**
 * Central entry point for targeted cache invalidation after mutations.
 * Keeps tag naming consistent with {@link TaggedCacheService} + {@link cache-tags}.
 */
@Injectable()
export class CacheInvalidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagged: TaggedCacheService,
  ) {}

  async resolveTenantIdBySchema(schemaName: string): Promise<string | null> {
    return getTenantIdBySchemaName(this.prisma, schemaName);
  }

  /**
   * Drops catalog list caches (products, categories) for affected branches.
   * Call after product/category/price/stock mutations so POS does not see stale lists.
   */
  async invalidateCatalogForBranches(
    tenantId: string,
    branchIds: readonly string[],
  ): Promise<void> {
    const tags = [
      ...catalogBranchTags(tenantId, branchIds),
      ...catalogTenantTags(tenantId),
    ];
    await this.tagged.invalidateTags(tags);
  }

  async invalidateCatalogTenant(tenantId: string): Promise<void> {
    await this.tagged.invalidateTags(catalogTenantTags(tenantId));
  }

  /** After sales, purchases, transfers, inventory-related journals, etc. */
  async invalidateFinancialForBranches(
    schemaName: string,
    branchIds: readonly string[],
  ): Promise<void> {
    const tags = financialBranchTags(schemaName, branchIds);
    await this.tagged.invalidateTags(tags);
  }

  async invalidateReconciliationForTenant(tenantId: string): Promise<void> {
    await this.tagged.invalidateTags(reconciliationTenantTags(tenantId));
  }

  async invalidateBranchAccessMetrics(
    schemaName: string,
    branchIds: readonly string[],
  ): Promise<void> {
    await this.tagged.invalidateTags(branchStatsBranchTags(schemaName, branchIds));
  }

  /**
   * Typical post-mutation hook: financial + reconciliation + branch-stats + catalog views
   * for the affected branches. Pass `tenantId` when already known to skip a lookup.
   */
  async invalidateAfterLedgerOrInventoryMutation(input: {
    schemaName: string;
    branchIds: readonly string[];
    tenantId?: string | null;
  }): Promise<void> {
    const tenantId =
      input.tenantId ?? (await this.resolveTenantIdBySchema(input.schemaName));
    await this.invalidateFinancialForBranches(
      input.schemaName,
      input.branchIds,
    );
    if (tenantId) {
      await this.invalidateReconciliationForTenant(tenantId);
      await this.invalidateCatalogForBranches(tenantId, input.branchIds);
    }
    await this.invalidateBranchAccessMetrics(
      input.schemaName,
      input.branchIds,
    );
  }
}
