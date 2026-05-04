import {
  classifyPaymentMethod,
  type PaymentGlBucket,
} from './payment-method.util';

export const STATEMENT_BUCKETS = ['cash', 'card', 'wallet'] as const;
export type StatementPaymentBucket = (typeof STATEMENT_BUCKETS)[number];

/**
 * Group payments for POS cash declaration: cash (incl. bank at counter), EVC/wallet, card.
 */
export function paymentMethodToStatementBucket(
  method: string | null | undefined,
): StatementPaymentBucket {
  const b: PaymentGlBucket = classifyPaymentMethod(method);
  if (b === 'card') return 'card';
  if (b === 'wallet') return 'wallet';
  return 'cash';
}
