import type { Request } from 'express';

/**
 * Branch UUIDs visible for reads on this request (middleware-normalized).
 */
export function readScopeBranchIdsFromRequest(req: Request): string[] {
  const fromScope = req.branchReadScope?.readBranchIds;
  if (fromScope?.length) return [...fromScope];
  return [...(req.allowedBranchIds ?? [])];
}
