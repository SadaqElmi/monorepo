/** Standalone POS discount caps (aligned with API sales guard). */

export const MAX_CASHIER_DISCOUNT_PCT = 1;
export const MAX_MANAGER_DISCOUNT_PCT = 10;

function normalizeRole(role?: string | null): string {
  return role?.trim().toLowerCase() ?? "";
}

export function maxDiscountPercentForRole(role?: string | null): number {
  const r = normalizeRole(role);
  if (r === "manager" || r === "admin") return MAX_MANAGER_DISCOUNT_PCT;
  return MAX_CASHIER_DISCOUNT_PCT;
}

export function isManagerTierRole(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === "manager" || r === "admin";
}
