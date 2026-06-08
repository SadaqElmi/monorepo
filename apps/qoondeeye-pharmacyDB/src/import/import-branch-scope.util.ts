import type { FastifyRequest } from 'fastify';
import { readScopeBranchIdsFromRequest } from '../common/branch-scope/branch-read-scope.util';
import { hasGlobalBranchAccess } from '../common/security/branch-access.policy';

/**
 * Branch IDs the current user may reference in import validation/commit.
 * Uses read scope from middleware; admins/owners with a single-branch header
 * are expanded to all tenant branches so multi-branch Excel files validate.
 */
export async function resolveImportAllowedBranchIds(
  req: FastifyRequest,
  schemaName: string,
  listAllBranchIds: (schema: string) => Promise<string[]>,
): Promise<string[]> {
  let ids = readScopeBranchIdsFromRequest(req);
  if (
    hasGlobalBranchAccess(req.userRole, req.userCanViewAllBranches) &&
    ids.length <= 1
  ) {
    ids = await listAllBranchIds(schemaName);
  }
  return ids;
}
