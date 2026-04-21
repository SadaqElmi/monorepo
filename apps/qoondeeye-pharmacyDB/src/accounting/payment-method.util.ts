/**
 * Map POS / payment labels to clearing accounts (cash vs card vs bank vs wallet).
 * POS sales still use {@link normalizePaymentKey} (cash vs card only) for backward compatibility.
 */
export type PaymentGlBucket = 'cash' | 'card' | 'bank' | 'wallet';

export function classifyPaymentMethod(
  method: string | null | undefined,
): PaymentGlBucket {
  const m = (method ?? '').toLowerCase();
  if (
    m.includes('bank') ||
    m.includes('transfer') ||
    m.includes('wire') ||
    m.includes('ach')
  ) {
    return 'bank';
  }
  if (
    m.includes('wallet') ||
    m.includes('mobile') ||
    m.includes('mpesa') ||
    m.includes('m-pesa')
  ) {
    return 'wallet';
  }
  if (
    m.includes('card') ||
    m.includes('credit') ||
    m.includes('visa') ||
    m.includes('master') ||
    m.includes('amex') ||
    m.includes('stripe') ||
    m === 'cc'
  ) {
    return 'card';
  }
  return 'cash';
}

/**
 * Map POS payment labels/codes to clearing accounts (cash vs card).
 * Bank and wallet labels collapse to cash for legacy POS posting paths.
 */
export function normalizePaymentKey(
  method: string | null | undefined,
): 'cash' | 'card' {
  const bucket = classifyPaymentMethod(method);
  if (bucket === 'card') return 'card';
  return 'cash';
}
