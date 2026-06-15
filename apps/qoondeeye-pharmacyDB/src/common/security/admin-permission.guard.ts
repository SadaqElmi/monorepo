import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { getAuthTokenFromHeaders } from './auth-token.util';
import {
  roleHasAdminPermissions,
  type AdminPermission,
} from './admin-permissions';
import { ADMIN_PERMISSIONS_KEY } from './require-admin-permissions.decorator';

type PlatformJwtPayload = {
  sub?: string;
  role?: string;
  type?: string;
};

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = getAuthTokenFromHeaders(req.headers);
    if (!token) {
      throw new ForbiddenException('Admin authentication required');
    }

    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    let payload: PlatformJwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as PlatformJwtPayload;
    } catch {
      throw new ForbiddenException('Invalid admin token');
    }

    if (payload.type !== 'super_admin' || !payload.sub) {
      throw new ForbiddenException('Platform admin access required');
    }

    const role = (payload.role ?? '').trim().toLowerCase();
    const required =
      this.reflector.getAllAndOverride<AdminPermission[]>(
        ADMIN_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (!roleHasAdminPermissions(role, required)) {
      throw new ForbiddenException(
        `Missing admin permission: ${required.join(', ')}`,
      );
    }

    req.isSystem = true;
    req.userId = payload.sub;
    req.userRole = role;
    req.isSuperAdmin = role === 'super_admin';
    req.permissionCodes = [...required];
    return true;
  }
}
