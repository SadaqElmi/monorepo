import { isMissingRelationError } from './tenant-sql-errors';

describe('tenant-sql-errors', () => {
  it('matches pg undefined_table', () => {
    expect(isMissingRelationError({ code: '42P01' })).toBe(true);
  });
});
