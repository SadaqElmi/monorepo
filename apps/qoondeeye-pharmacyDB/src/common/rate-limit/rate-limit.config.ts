import type { RateLimitTier } from './rate-limit-paths';

export const RATE_LIMIT_KEY_PREFIX = 'pharmcare:v1:ratelimit';

const MS_PER_MINUTE = 60_000;

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw === 'true' || raw === '1';
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

export function isRateLimitEnabled(): boolean {
  return envBool('RATE_LIMIT_ENABLED', true);
}

export type TierLimitConfig = { limit: number; ttlMs: number };

export function getRateLimitConfig(): Record<RateLimitTier, TierLimitConfig> {
  const loginMax = envInt('LOGIN_RATE_LIMIT_MAX', envInt('RATE_LIMIT_LOGIN_PER_MIN', 5));
  const loginTtlSec = envInt('LOGIN_RATE_LIMIT_TTL', 60);

  return {
    login: {
      limit: loginMax,
      ttlMs: loginTtlSec * 1000,
    },
    pin: {
      limit: envInt('RATE_LIMIT_PIN_PER_MIN', 10),
      ttlMs: MS_PER_MINUTE,
    },
    staff: {
      limit: envInt('RATE_LIMIT_STAFF_LOGIN_PER_MIN', 10),
      ttlMs: MS_PER_MINUTE,
    },
    authOther: {
      limit: envInt('RATE_LIMIT_AUTH_OTHER_PER_MIN', 10),
      ttlMs: MS_PER_MINUTE,
    },
    public: {
      limit: envInt('RATE_LIMIT_PUBLIC_PER_MIN', 30),
      ttlMs: MS_PER_MINUTE,
    },
    reports: {
      limit: envInt('RATE_LIMIT_REPORTS_PER_MIN', 20),
      ttlMs: MS_PER_MINUTE,
    },
    default: {
      limit: Math.min(
        envInt('RATE_LIMIT_API_PER_MIN', 200),
        300,
      ),
      ttlMs: MS_PER_MINUTE,
    },
  };
}
