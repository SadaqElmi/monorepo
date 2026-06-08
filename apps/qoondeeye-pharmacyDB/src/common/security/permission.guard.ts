import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { userHasPermissions } from './permission-resolve.util';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!userHasPermissions(req, ...required)) {
      throw new ForbiddenException(
        `Missing permission: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
