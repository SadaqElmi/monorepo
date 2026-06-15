import { maxSaleDiscountPercentForRole } from './sales-discount.policy';

describe('maxSaleDiscountPercentForRole', () => {
  it('allows manager tier for override_credit_limit permission', () => {
    expect(maxSaleDiscountPercentForRole('cashier', ['override_credit_limit'])).toBe(10);
  });

  it('allows manager tier for admin role', () => {
    expect(maxSaleDiscountPercentForRole('admin')).toBe(10);
  });

  it('uses manager tier for manager and pharmacist roles', () => {
    expect(maxSaleDiscountPercentForRole('manager')).toBe(10);
    expect(maxSaleDiscountPercentForRole('pharmacist')).toBe(10);
  });

  it('uses cashier tier for roles without override permission', () => {
    expect(maxSaleDiscountPercentForRole('cashier')).toBe(1);
    expect(maxSaleDiscountPercentForRole(undefined)).toBe(1);
    expect(maxSaleDiscountPercentForRole('')).toBe(1);
  });
});
