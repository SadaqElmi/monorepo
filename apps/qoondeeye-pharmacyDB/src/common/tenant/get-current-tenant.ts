import type { FastifyRequest } from 'fastify';

export function getCurrentTenant(req: FastifyRequest) {
  return req.tenant ?? null;
}
