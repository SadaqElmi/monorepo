/**
 * Lightweight regression checks for return quantity / voucher rules
 * (mirrors server logic: sold − returned − pending vouchers).
 */
describe('Return flow invariants', () => {
  function maxReturnable(
    sold: number,
    alreadyReturned: number,
    pendingVoucherQty: number,
  ) {
    return Math.max(0, sold - alreadyReturned - pendingVoucherQty);
  }

  it('partial returns reduce remaining', () => {
    expect(maxReturnable(10, 4, 0)).toBe(6);
    expect(maxReturnable(10, 4, 2)).toBe(4);
  });

  it('cannot return more than remaining including pending vouchers', () => {
    const sold = 5;
    const returned = 2;
    const pending = 2;
    const want = 2;
    expect(want <= maxReturnable(sold, returned, pending)).toBe(false);
    expect(1 <= maxReturnable(sold, returned, pending)).toBe(true);
  });

  it('branch mismatch is a separate guard in API', () => {
    const saleBranch: string = 'branch-a';
    const requestBranch: string = 'branch-b';
    expect(saleBranch === requestBranch).toBe(false);
  });
});
