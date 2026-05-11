import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  branchStatsBranchTags,
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
    const row = await this.prisma.tenant.findUnique({
      where: { schemaName },
      select: { id: true },
    });
    return row?.id ?? null;
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
   * Typical post-mutation hook: financial + reconciliation + branch-stats views
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
    }
    await this.invalidateBranchAccessMetrics(
      input.schemaName,
      input.branchIds,
    );
  }
}
