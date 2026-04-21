import { BadRequestException } from '@nestjs/common';
import { assertJournalLinesWhenRequired } from './accounting-journal-guards';

describe('assertJournalLinesWhenRequired', () => {
  it('allows zero lines when there is no economic impact', () => {
    expect(() =>
      assertJournalLinesWhenRequired(false, 0, 'postSaleJournal', 'x'),
    ).not.toThrow();
  });

  it('throws when economic impact is declared but no lines were built', () => {
    expect(() =>
      assertJournalLinesWhenRequired(true, 0, 'postSaleJournal', 'sale-1'),
    ).toThrow(BadRequestException);
  });

  it('allows non-zero lines when economic impact is declared', () => {
    expect(() =>
      assertJournalLinesWhenRequired(true, 2, 'postSaleReturnJournal', 'r1'),
    ).not.toThrow();
  });
});
