import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import { branchStatsBranchTags } from '../cache/cache-tags';
import { normalizeBranchScope, stableCacheKeySegment } from '../cache/cache-keys';

export type BranchAccessMetricsResult = {
  branchScope: string;
  from: string;
  to: string;
  totalDenied: number;
  byReason: Record<string, number>;
  blockedCrossBranchAttempts: number;
  branchMismatchRejections: number;
  privilegedMultiBranchUsage: number;
};

@Injectable()
export class BranchSecurityMetricsService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taggedCache: TaggedCacheService,
  ) {
    const raw = Number(process.env.CACHE_DEFAULT_TTL_MS);
    this.ttlMs =
      Number.isFinite(raw) && raw > 0 ? Math.min(600_000, Math.max(5_000, raw)) : 60_000;
  }

  async getBranchAccessMetrics(input: {
    schemaName: string;
    queryBranchIds: string[];
    fromDate: string;
    toDate: string;
    branchScopeLabel: string;
  }): Promise<BranchAccessMetricsResult> {
    const cacheKey = stableCacheKeySegment([
      'branch_access_metrics',
      input.schemaName,
      normalizeBranchScope(input.queryBranchIds),
      input.fromDate,
      input.toDate,
    ]);
    const tags = branchStatsBranchTags(input.schemaName, input.queryBranchIds);
    return this.taggedCache.getOrSet(
      cacheKey,
      tags,
      this.ttlMs,
      async () => {
        return this.prisma.withTenantSchema(input.schemaName, async (tx) => {
          const totals = await tx.$queryRawUnsafe<
            Array<{ reason: string | null; count: number }>
          >(
            `SELECT
           COALESCE(new_payload->>'reason', 'unknown') AS reason,
           COUNT(*)::int AS count
         FROM audit_logs
         WHERE table_name = 'security_branch'
           AND action = 'branch_access_denied'
           AND (
             branch_id IS NULL OR branch_id = ANY($1::uuid[])
           )
           AND created_at >= $2::date
           AND created_at <= ($3::date + interval '1 day')
         GROUP BY COALESCE(new_payload->>'reason', 'unknown')
         ORDER BY count DESC`,
            input.queryBranchIds,
            input.fromDate,
            input.toDate,
          );
          const byReason = Object.fromEntries(
            totals.map((row) => [row.reason ?? 'unknown', Number(row.count) || 0]),
          );
          const totalDenied = Object.values(byReason).reduce(
            (sum, current) => sum + current,
            0,
          );

          const privilegedCountRows = await tx.$queryRawUnsafe<
            Array<{ c: number }>
          >(
            `SELECT COUNT(*)::int AS c
         FROM audit_logs
         WHERE table_name = 'security_branch'
           AND action = 'branch_access_denied'
           AND (
             branch_id IS NULL OR branch_id = ANY($1::uuid[])
           )
           AND created_at >= $2::date
           AND created_at <= ($3::date + interval '1 day')
           AND COALESCE(new_payload->>'role', '') IN ('admin', 'owner')`,
            input.queryBranchIds,
            input.fromDate,
            input.toDate,
          );

          return {
            branchScope: input.branchScopeLabel,
            from: input.fromDate,
            to: input.toDate,
            totalDenied,
            byReason,
            blockedCrossBranchAttempts:
              (byReason.branch_header_mismatch ?? 0) +
              (byReason.non_admin_requested_all_branches ?? 0),
            branchMismatchRejections: byReason.branch_header_mismatch ?? 0,
            privilegedMultiBranchUsage: Number(privilegedCountRows[0]?.c ?? 0),
          };
        });
      },
    );
  }
}
