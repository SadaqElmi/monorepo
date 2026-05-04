import { maxSaleDiscountPercentForRole } from './sales-discount.policy';

describe('maxSaleDiscountPercentForRole', () => {
  it('allows 10% tier for manager and admin', () => {
    expect(maxSaleDiscountPercentForRole('manager')).toBe(10);
    expect(maxSaleDiscountPercentForRole('MANAGER')).toBe(10);
    expect(maxSaleDiscountPercentForRole('admin')).toBe(10);
  });

  it('uses 1% tier for cashier, pharmacist, and unknown roles', () => {
    expect(maxSaleDiscountPercentForRole('cashier')).toBe(1);
    expect(maxSaleDiscountPercentForRole('pharmacist')).toBe(1);
    expect(maxSaleDiscountPercentForRole(undefined)).toBe(1);
    expect(maxSaleDiscountPercentForRole('')).toBe(1);
  });
});
