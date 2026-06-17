import type { FastifyRequest } from 'fastify';
import { hasAllEffectivePermissions } from './permission-catalog';

/** Tenant admin bypass (full access within pharmacy). */
export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'admin';
}

/** Platform super admin (JWT type `super_admin` / branch middleware flag). */
export function isSuperAdminRequest(req: FastifyRequest): boolean {
  return (
    req.isSuperAdmin === true ||
    (req.userRole ?? '').trim().toLowerCase() === 'super_admin'
  );
}

export function userHasPermissions(
  req: FastifyRequest,
  ...required: string[]
): boolean {
  if (!required.length) return true;
  if (isSuperAdminRequest(req) || isAdminRole(req.userRole)) return true;
  return hasAllEffectivePermissions(req.permissionCodes ?? [], required);
}
