import { reportDateRangeSchema } from '@repo/validation';

const branchId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Report filters DTO sync', () => {
  describe('reportDateRangeSchema', () => {
    it('accepts valid from/to range', () => {
      const result = reportDateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-31',
        branchId,
      });
      expect(result.success).toBe(true);
    });

    it('rejects from after to', () => {
      const result = reportDateRangeSchema.safeParse({
        from: '2026-02-01',
        to: '2026-01-31',
      });
      expect(result.success).toBe(false);
    });

    it('rejects partial compare range', () => {
      const result = reportDateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-31',
        compareFrom: '2025-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepts full compare range when both set', () => {
      const result = reportDateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-31',
        compareFrom: '2025-01-01',
        compareTo: '2025-01-31',
      });
      expect(result.success).toBe(true);
    });

    it('rejects compareFrom after compareTo', () => {
      const result = reportDateRangeSchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-31',
        compareFrom: '2025-02-01',
        compareTo: '2025-01-31',
      });
      expect(result.success).toBe(false);
    });
  });
});
