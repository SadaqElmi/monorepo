import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { requestPathname } from '../http/request-pathname';
import { BranchMiddleware } from '../middleware/branch.middleware';

function isPublicBranchRoute(path: string): boolean {
  return (
    path.startsWith('/api/auth') ||
    path.startsWith('/api/tenants') ||
    path.startsWith('/api/domains') ||
    path.startsWith('/api/system-users') ||
    path.startsWith('/api/admin/') ||
    path === '/api'
  );
}

/**
 * Fastify does not always await Nest middleware before route handlers run.
 * This guard ensures branch scope is applied before controllers read `req.allowedBranchIds`.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly branchMiddleware: BranchMiddleware) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if ((req.method ?? '').toUpperCase() === 'OPTIONS') return true;

    const pathname = requestPathname(req);
    if (isPublicBranchRoute(pathname) || req.isSystem) return true;

    if (req.allowedBranchIds?.length && req.userId) return true;

    await this.branchMiddleware.ensureBranchScopeForRequest(req);
    return true;
  }
}
