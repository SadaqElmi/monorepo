import {
  paymentMethodToStatementBucket,
  STATEMENT_BUCKETS,
} from './pos-statement-bucket.util';

describe('pos-statement-bucket.util', () => {
  it('maps card-like methods to card', () => {
    expect(paymentMethodToStatementBucket('Visa')).toBe('card');
    expect(paymentMethodToStatementBucket('CARD')).toBe('card');
  });

  it('maps EVC / wallet labels to wallet', () => {
    expect(paymentMethodToStatementBucket('EVC-Plus')).toBe('wallet');
    expect(paymentMethodToStatementBucket('mpesa')).toBe('wallet');
  });

  it('maps cash and bank transfers to cash bucket', () => {
    expect(paymentMethodToStatementBucket('cash')).toBe('cash');
    expect(paymentMethodToStatementBucket('bank transfer')).toBe('cash');
  });

  it('exports three declaration buckets', () => {
    expect(STATEMENT_BUCKETS).toEqual(['cash', 'card', 'wallet']);
  });
});
