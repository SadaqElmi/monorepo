import type { BranchReadScope } from '../branch-scope/branch-scope.types';
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: {
      id: string;
      schema_name: string;
      name: string;
      slug?: string | null;
      subdomain?: string | null;
      database_name?: string | null;
      status?: string | null;
    };
    tenantId?: string;
    tenantSlug?: string | null;
    tenantName?: string;
    tenantDatabaseName?: string | null;
    isSystem?: boolean;
    /**
     * Branch isolation context (tenant-scoped).
     * - `branchId` is always a UUID for use in mutations (create/update).
     * - `allowedBranchIds` is used for filtering reads/mutations with `branch_id IN (...)`.
     */
    branchId?: string;
    allowedBranchIds?: string[];
    /** Normalized read vs mutation branch scope (set by branch middleware). */
    branchReadScope?: BranchReadScope;
    /** Authenticated tenant user context from JWT middleware. */
    userId?: string;
    userRole?: string;
    userCanViewAllBranches?: boolean;
    /** Resolved from JWT `permissions` (or legacy admin/manager fallback). */
    permissionCodes?: string[];
    /** Set when JWT type is `super_admin`. */
    isSuperAdmin?: boolean;
    /** Global request idempotency/correlation metadata. */
    idempotencyKey?: string;
    correlationId?: string;
    causationId?: string;
    /** Assigned by RequestContextMiddleware (or client x-request-id). */
    requestId?: string;
    requestStartedAt?: number;
  }
}
