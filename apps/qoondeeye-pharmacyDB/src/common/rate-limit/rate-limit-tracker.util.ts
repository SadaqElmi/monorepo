import type { FastifyRequest } from 'fastify';
import { requestPathname } from '../http/request-pathname';
import { getClientIp } from './client-ip.util';
import { resolveRateLimitTier, type RateLimitTier } from './rate-limit-paths';
import type { TenantContextService } from '../../tenant/tenant-context.service';

type BodyRecord = Record<string, unknown>;

function readBodyField(req: FastifyRequest, key: string): string | undefined {
  const body = req.body as BodyRecord | string | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const raw = body[key];
  return typeof raw === 'string' ? raw.trim() : undefined;
}

function normalizeEmail(email: string | undefined): string {
  return (email ?? 'unknown').toLowerCase();
}

/** Parse `pdv1.{deviceId}.{secret}` — return deviceId only, never the secret. */
export function parseDeviceIdFromCredential(
  credential: string | undefined,
): string {
  if (!credential?.trim()) return 'unknown';
  const parts = credential.trim().split('.');
  if (parts.length >= 2 && parts[0] === 'pdv1') {
    return parts[1]!.trim() || 'unknown';
  }
  return 'unknown';
}

export function buildRateLimitTracker(
  req: FastifyRequest,
  tenantContext: TenantContextService,
): { tier: RateLimitTier; tracker: string } {
  const path = requestPathname(req);
  const method = req.method ?? 'GET';
  const tier = resolveRateLimitTier(path, method);
  const ip = getClientIp(req);
  const tenant = tenantContext.getTenant();
  const tenantId = tenant?.id ?? 'public';
  const tenantSlug =
    readBodyField(req, 'tenant') ??
    tenant?.schemaName ??
    (tenantId !== 'public' ? tenantId : 'public');

  switch (tier) {
    case 'login': {
      const email = normalizeEmail(readBodyField(req, 'email'));
      const slug = readBodyField(req, 'tenant')?.toLowerCase() ?? 'public';
      return {
        tier,
        tracker: `tenant:${slug}:email:${email}:ip:${ip}`,
      };
    }
    case 'pin': {
      const terminal =
        readBodyField(req, 'staffId') ??
        readBodyField(req, 'branchId') ??
        'anon';
      return {
        tier,
        tracker: `tenant:${tenantSlug}:terminal:${terminal}:ip:${ip}`,
      };
    }
    case 'staff': {
      const deviceId = parseDeviceIdFromCredential(
        readBodyField(req, 'deviceCredential'),
      );
      return {
        tier,
        tracker: `tenant:${tenantSlug}:terminal:${deviceId}:ip:${ip}`,
      };
    }
    case 'authOther':
    case 'public':
      return {
        tier,
        tracker: `tenant:public:ip:${ip}:path:${path}`,
      };
    case 'reports':
    case 'default':
    default: {
      const userId = req.userId ?? 'anon';
      return {
        tier,
        tracker: `tenant:${tenantId}:user:${userId}:ip:${ip}`,
      };
    }
  }
}
