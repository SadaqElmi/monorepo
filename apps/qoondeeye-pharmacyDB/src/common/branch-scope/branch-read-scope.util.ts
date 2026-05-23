import type { FastifyRequest } from 'fastify';

/**
 * Branch UUIDs visible for reads on this request (middleware-normalized).
 */
export function readScopeBranchIdsFromRequest(req: FastifyRequest): string[] {
  const fromScope = req.branchReadScope?.readBranchIds;
  if (fromScope?.length) return [...fromScope];
  return [...(req.allowedBranchIds ?? [])];
}
