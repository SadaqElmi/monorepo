import type { FastifyRequest } from 'fastify';
import { hasAllEffectivePermissions } from './permission-catalog';

/** Admin bypass preserved for Phase 2 (removed in later phase). */
export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'admin';
}

export function userHasPermissions(
  req: FastifyRequest,
  ...required: string[]
): boolean {
  if (!required.length) return true;
  if (isAdminRole(req.userRole)) return true;
  return hasAllEffectivePermissions(req.permissionCodes ?? [], required);
}
