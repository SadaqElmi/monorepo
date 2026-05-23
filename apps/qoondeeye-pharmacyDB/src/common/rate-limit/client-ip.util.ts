import type { FastifyRequest } from 'fastify';

const IP_V4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IP_V6 = /^[0-9a-f:]+$/i;

function isPlausibleIp(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return IP_V4.test(v) || (v.includes(':') && IP_V6.test(v));
}

/**
 * Client IP behind Railway/Render/Cloudflare when `trustProxy: true`.
 * Never reads raw X-Forwarded-For or cf-connecting-ip manually.
 */
export function getClientIp(req: FastifyRequest): string {
  const fromIps = req.ips?.[0]?.trim();
  if (fromIps && isPlausibleIp(fromIps)) return fromIps;
  const fromIp = req.ip?.trim();
  if (fromIp && isPlausibleIp(fromIp)) return fromIp;
  if (fromIps) return fromIps;
  if (fromIp) return fromIp;
  return 'unknown';
}
