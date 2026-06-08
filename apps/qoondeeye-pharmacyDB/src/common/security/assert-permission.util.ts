import { ForbiddenException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { userHasPermissions } from './permission-resolve.util';

/** Mirrors PermissionGuard logic for inline checks (e.g. conditional body fields). */
export function assertHasPermission(
  req: FastifyRequest,
  ...required: string[]
): void {
  if (!required.length) return;
  if (!userHasPermissions(req, ...required)) {
    throw new ForbiddenException(
      `Missing permission: ${required.join(', ')}`,
    );
  }
}
