import type { FastifyRequest } from 'fastify';
import { buildRateLimitTracker, parseDeviceIdFromCredential } from './rate-limit-tracker.util';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { resolveRateLimitTier, shouldSkipRateLimitPath } from './rate-limit-paths';

describe('rate limit paths', () => {
  it('skips health and SSE', () => {
    expect(shouldSkipRateLimitPath('/api', 'GET')).toBe(true);
    expect(shouldSkipRateLimitPath('/api/inventory/stream', 'GET')).toBe(true);
    expect(shouldSkipRateLimitPath('/api/sales', 'POST')).toBe(false);
  });

  it('classifies login routes', () => {
    expect(resolveRateLimitTier('/api/auth/login', 'POST')).toBe('login');
    expect(resolveRateLimitTier('/api/auth/pin-login', 'POST')).toBe('pin');
  });
});

describe('buildRateLimitTracker', () => {
  const tenantContext = new TenantContextService();

  it('login tracker uses email not password', () => {
    const req = {
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: 'User@Example.com',
        password: 'super-secret',
        tenant: 'pharmacy1',
      },
      ips: ['203.0.113.1'],
    } as FastifyRequest;

    const { tracker } = buildRateLimitTracker(req, tenantContext);
    expect(tracker).toContain('email:user@example.com');
    expect(tracker).not.toContain('super-secret');
    expect(tracker).toContain('tenant:pharmacy1');
  });

  it('authenticated API tracker includes tenant and user segments', () => {
    tenantContext.runWithContext(() => {
      tenantContext.setTenant({
        id: 'tenant-uuid',
        name: 'Test',
        schemaName: 'pharmacy1',
        status: 'active',
      });
      const req = {
        method: 'GET',
        url: '/api/products',
        userId: 'user-uuid',
        ips: ['203.0.113.1'],
      } as FastifyRequest;

      const { tracker } = buildRateLimitTracker(req, tenantContext);
      expect(tracker).toBe(
        'tenant:tenant-uuid:user:user-uuid:ip:203.0.113.1',
      );
    });
  });
});

describe('parseDeviceIdFromCredential', () => {
  it('extracts device id without secret', () => {
    expect(parseDeviceIdFromCredential('pdv1.abc-device.secretpart')).toBe(
      'abc-device',
    );
  });
});
