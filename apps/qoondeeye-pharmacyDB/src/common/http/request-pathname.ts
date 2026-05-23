/**
 * Full pathname for route guards (includes global `/api` prefix when present).
 * Works with both Express and Fastify request shapes.
 */
export function requestPathname(req: {
  url?: string;
  originalUrl?: string;
  raw?: { url?: string };
}): string {
  const raw = req.originalUrl ?? req.url ?? req.raw?.url ?? '';
  const q = raw.indexOf('?');
  return q === -1 ? raw : raw.slice(0, q);
}
