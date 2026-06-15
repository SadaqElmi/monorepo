import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PosAuthRateLimitService } from './pos-auth-rate-limit.service';

function createService(redisRequired = false) {
  const config = {
    get: (key: string) =>
      key === 'POS_RATE_LIMIT_REDIS_REQUIRED' && redisRequired ? 'true' : undefined,
  } as ConfigService;
  return new PosAuthRateLimitService(null, config);
}

describe('PosAuthRateLimitService', () => {
  const lockWindowMs = 5 * 60 * 1000;

  it('locks out after max failures in memory fallback', async () => {
    const service = createService();
    const key = 'setup:test-user';

    for (let i = 0; i < 5; i += 1) {
      await service.registerFailure(key, 5, lockWindowMs);
    }

    await expect(
      service.assertNotLocked(key, lockWindowMs, 'locked'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('clears failures after successful auth', async () => {
    const service = createService();
    const key = 'device:staff';

    await service.registerFailure(key, 5, lockWindowMs);
    await service.clearFailures(key);

    await expect(
      service.assertNotLocked(key, lockWindowMs, 'locked'),
    ).resolves.toBeUndefined();
  });
});
