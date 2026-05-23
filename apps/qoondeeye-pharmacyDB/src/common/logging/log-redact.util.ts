const SENSITIVE_KEYS = new Set(
  [
    'password',
    'pin',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'cookie',
    'secret',
    'apikey',
    'devicecredential',
    'auth_token',
    'devicesecret',
    'cardnumber',
    'cvv',
    'cvc',
    'paymentsecret',
    'stripe',
  ].map((k) => k.toLowerCase()),
);

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return true;
  return (
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.endsWith('pin')
  );
}

export function redactForLog<T>(value: T, depth = 0): T {
  if (depth > 8) return '[MaxDepth]' as T;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, depth + 1)) as T;
  }
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactForLog(val, depth + 1);
    }
  }
  return out as T;
}

export function isAuthPath(pathname: string): boolean {
  return pathname.startsWith('/api/auth');
}
