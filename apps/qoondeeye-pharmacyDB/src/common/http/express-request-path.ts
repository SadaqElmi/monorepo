import type { Request } from 'express';

/**
 * Prefer `originalUrl` — Nest's `req.path` may omit the global `/api` prefix depending on mount,
 * which breaks public-route checks for `/api/tenants`, `/api/auth`, etc.
 */
export function expressRequestPathname(req: Request): string {
  const raw = req.originalUrl ?? req.url ?? '';
  const q = raw.indexOf('?');
  return q === -1 ? raw : raw.slice(0, q);
}
