/**
 * Normalized branch visibility for a tenant-scoped HTTP request.
 * Populated once in branch middleware; read paths should prefer this over
 * re-deriving scope from raw `x-branch-id` strings.
 */
export type BranchReadScope = {
  /** Branch UUIDs allowed for GET / list filters (`branch_id IN (...)`). */
  readBranchIds: string[];
  /** True when the client sent `x-branch-id: all` (or equivalent) and policy allowed full-tenant read. */
  readAllBranches: boolean;
  /** Single branch UUID used as the operational context for mutations (`req.branchId`). */
  mutationBranchId: string;
};
