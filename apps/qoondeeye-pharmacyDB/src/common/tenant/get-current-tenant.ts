import type { Request } from 'express';

export function getCurrentTenant(req: Request) {
  return req.tenant ?? null;
}
