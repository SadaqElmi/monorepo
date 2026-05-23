import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { readScopeBranchIdsFromRequest } from './branch-read-scope.util';
import { hasGlobalBranchAccess } from '../security/branch-access.policy';

const branchScopeLogger = new Logger('BranchScope');
const MAX_REPORT_SCOPE_BRANCHES = 10;
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const ALERT_AGGREGATE_ALL_THRESHOLD = 20;
const ALERT_WIDE_SCOPE_THRESHOLD = 10;
const aggregateAllTimestamps: number[] = [];
const wideScopeTimestamps: number[] = [];

function pushMetricAndGetRecentCount(
  bucket: number[],
  nowMs: number,
  windowMs: number,
): number {
  bucket.push(nowMs);
  while (bucket.length && nowMs - bucket[0] > windowMs) {
    bucket.shift();
  }
  return bucket.length;
}

/** Throws 403 if the request has no authorized branch scope. */
export function assertAllowedBranches(req: FastifyRequest): string[] {
  const allowed = readScopeBranchIdsFromRequest(req);
  if (!allowed.length) {
    throw new ForbiddenException('Access denied to this branch');
  }
  return allowed;
}

/** Returns ids that appear in both lists (deduped, stable order from requested). */
export function intersectWithAllowed(
  allowed: string[],
  requested: string[],
): string[] {
  const set = new Set(allowed);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of requested) {
    if (set.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function parseBranchIdsCsv(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type ResolveReportBranchOptions = {
  branchId?: string;
  /** Comma-separated UUIDs; each must be in allowedBranchIds. */
  branchIds?: string;
  /** When true, aggregate across every branch in the current allowed read scope. */
  aggregateAll?: boolean;
};

export type ReportScopeMeta = {
  branchIds: string[];
  aggregateAll: boolean;
  scopeHash: string;
  correlationId?: string | null;
  warning?: string;
  suggest?: string;
  adminOverrideWarning?: string;
  isSoftLimited?: boolean;
};

export function buildBranchScopeHash(
  branchIds: string[],
  aggregateAll: boolean,
): string {
  const normalized = [...new Set(branchIds)].sort().join(',');
  return createHash('sha1')
    .update(`agg:${aggregateAll ? 1 : 0}|branches:${normalized}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Resolves which branch UUIDs a report should include.
 * - aggregateAll: all of req.allowedBranchIds
 * - branchIds: CSV intersected with allowed (must match exactly — no unknown ids)
 * - else: single branch from branchId query or req.branchId
 */
export function resolveReportBranchScope(
  req: FastifyRequest,
  opts: ResolveReportBranchOptions,
): ReportScopeMeta {
  const allowed = assertAllowedBranches(req);
  const actorUserId = req.userId ?? null;
  const correlationId = req.correlationId ?? null;
  let resolved: string[];
  let usedAggregateAll = false;
  let warning: string | undefined;
  let suggest: string | undefined;
  let adminOverrideWarning: string | undefined;
  let isSoftLimited = false;

  if (opts.aggregateAll === true) {
    if (!isGlobalBranchRole(req)) {
      throw new ForbiddenException(
        'aggregateAll is restricted to admin/owner roles',
      );
    }
    resolved = [...new Set(allowed)];
    usedAggregateAll = true;
    adminOverrideWarning = 'You are viewing ALL branches';
    const now = Date.now();
    const aggregateRecent = pushMetricAndGetRecentCount(
      aggregateAllTimestamps,
      now,
      ALERT_WINDOW_MS,
    );
    if (aggregateRecent >= ALERT_AGGREGATE_ALL_THRESHOLD) {
      branchScopeLogger.error(
        `BRANCH_SCOPE_ALERT ${JSON.stringify({
          reason: 'frequent_aggregate_all',
          threshold: ALERT_AGGREGATE_ALL_THRESHOLD,
          windowMs: ALERT_WINDOW_MS,
          count: aggregateRecent,
          actorUserId,
          correlationId,
        })}`,
      );
    }
  } else {
    const csv = opts.branchIds?.trim();
    if (csv) {
      const requested = parseBranchIdsCsv(csv);
      if (!requested.length) {
        throw new BadRequestException(
          'branchIds must list at least one UUID when provided',
        );
      }
      const intersected = intersectWithAllowed(allowed, requested);
      if (intersected.length !== requested.length) {
        throw new ForbiddenException(
          'One or more branchIds are not in your allowed scope',
        );
      }
      resolved = intersected;
    } else {
      const single = opts.branchId?.trim() || req.branchId || allowed[0];
      if (
        !single ||
        single.toLowerCase() === 'all' ||
        !allowed.includes(single)
      ) {
        throw new BadRequestException('Valid branchId is required');
      }
      resolved = [single];
    }
  }

  if (resolved.length > MAX_REPORT_SCOPE_BRANCHES) {
    const now = Date.now();
    const wideRecent = pushMetricAndGetRecentCount(
      wideScopeTimestamps,
      now,
      ALERT_WINDOW_MS,
    );
    branchScopeLogger.warn(
      `BRANCH_SCOPE_TOO_WIDE ${JSON.stringify({
        actorUserId,
        correlationId,
        branchIds: resolved,
        aggregateAll: usedAggregateAll,
        maxBranches: MAX_REPORT_SCOPE_BRANCHES,
        repeatedWideScopesInWindow: wideRecent,
      })}`,
    );
    if (wideRecent >= ALERT_WIDE_SCOPE_THRESHOLD) {
      branchScopeLogger.error(
        `BRANCH_SCOPE_ALERT ${JSON.stringify({
          reason: 'repeated_wide_scopes',
          threshold: ALERT_WIDE_SCOPE_THRESHOLD,
          windowMs: ALERT_WINDOW_MS,
          count: wideRecent,
          actorUserId,
          correlationId,
        })}`,
      );
    }
    warning = 'Too many branches selected';
    suggest = 'Use aggregateAll instead';
    if (!usedAggregateAll) {
      resolved = resolved.slice(0, MAX_REPORT_SCOPE_BRANCHES);
      isSoftLimited = true;
    }
  }

  const scopeHash = buildBranchScopeHash(resolved, usedAggregateAll);
  branchScopeLogger.log(
    `BRANCH_SCOPE_RESOLVED ${JSON.stringify({
      actorUserId,
      correlationId,
      branchIds: resolved,
      aggregateAll: usedAggregateAll,
      scopeHash,
      warning,
      suggest,
      adminOverrideWarning,
    })}`,
  );
  return {
    branchIds: resolved,
    aggregateAll: usedAggregateAll,
    scopeHash,
    correlationId,
    warning,
    suggest,
    adminOverrideWarning,
    isSoftLimited,
  };
}

export function resolveReportBranchIds(
  req: FastifyRequest,
  opts: ResolveReportBranchOptions,
): string[] {
  return resolveReportBranchScope(req, opts).branchIds;
}

/** Single-branch selection for mutations and legacy endpoints (one explicit branch). */
export function resolveSingleBranchId(
  req: FastifyRequest,
  queryBranchId?: string,
): string {
  const [id] = resolveReportBranchIds(req, { branchId: queryBranchId });
  return id;
}

export function assertDtoBranchAllowed(
  req: FastifyRequest,
  dtoBranchId: string | undefined,
): void {
  const allowed = assertAllowedBranches(req);
  if (!dtoBranchId || !allowed.includes(dtoBranchId)) {
    throw new ForbiddenException('Invalid branch');
  }
}

/**
 * SQL predicate for a uuid column vs one or many branch ids.
 * Always binds branch id(s) as the first parameter(s) starting at `paramStart` (1-based).
 * Returns fragment and the list of bind values to prepend before other query args.
 */
export function branchColumnPredicate(
  columnSql: string,
  branchIds: string[],
  paramStart: number,
): { sql: string; branchParams: unknown[]; nextParamIndex: number } {
  if (!branchIds.length) {
    throw new BadRequestException('At least one branch is required');
  }
  if (branchIds.length === 1) {
    return {
      sql: `${columnSql} = $${paramStart}::uuid`,
      branchParams: [branchIds[0]],
      nextParamIndex: paramStart + 1,
    };
  }
  return {
    sql: `${columnSql} = ANY($${paramStart}::uuid[])`,
    branchParams: [branchIds],
    nextParamIndex: paramStart + 1,
  };
}

/** True when the user is admin/owner (global branch visibility policy). */
export function isGlobalBranchRole(req: FastifyRequest): boolean {
  return hasGlobalBranchAccess(req.userRole, req.userCanViewAllBranches);
}
