import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const codes = req.permissionCodes ?? [];
    const ok = required.every((p) => codes.includes(p));
    if (!ok) {
      throw new ForbiddenException(
        `Missing permission: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
