const GLOBAL_BRANCH_ACCESS_ROLES = new Set(['admin', 'owner']);
const BRANCH_REQUIRED_ROLES = new Set(['cashier', 'staff', 'manager']);

export function normalizeRole(role?: string | null): string {
  return role?.trim().toLowerCase() ?? '';
}

export function hasGlobalBranchAccess(
  role?: string | null,
  canViewAllBranches?: boolean | null,
): boolean {
  if (typeof canViewAllBranches === 'boolean') return canViewAllBranches;
  return GLOBAL_BRANCH_ACCESS_ROLES.has(normalizeRole(role));
}

export function requiresAssignedBranch(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return true;
  if (hasGlobalBranchAccess(normalized)) return false;
  return BRANCH_REQUIRED_ROLES.has(normalized) || normalized.length > 0;
}

export function isCashierRole(role?: string | null): boolean {
  return normalizeRole(role) === 'cashier';
}
