import { hasEffectivePermission } from '../common/security/permission-catalog';
import { normalizeRole } from '../common/security/branch-access.policy';

const POS_MAX_DISCOUNT_PCT_CASHIER_TIER = 1;
const POS_MAX_DISCOUNT_PCT_MANAGER_TIER = 10;

/** Max discount as percent of line subtotal allowed for POS/API sale creation. */
export function maxSaleDiscountPercentForRole(
  role?: string | null,
  permissionCodes?: readonly string[] | null,
): number {
  if (hasEffectivePermission(permissionCodes ?? [], 'override_credit_limit')) {
    return POS_MAX_DISCOUNT_PCT_MANAGER_TIER;
  }
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'manager' || r === 'pharmacist') {
    return POS_MAX_DISCOUNT_PCT_MANAGER_TIER;
  }
  return POS_MAX_DISCOUNT_PCT_CASHIER_TIER;
}
