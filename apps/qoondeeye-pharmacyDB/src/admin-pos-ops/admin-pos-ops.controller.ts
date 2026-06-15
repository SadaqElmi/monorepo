import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { getAuthTokenFromHeaders } from '../common/security/auth-token.util';
import { isSuperAdminRequest } from '../common/security/permission-resolve.util';
import { AdminPosOpsService } from './admin-pos-ops.service';

@Controller('admin/retail-ops')
export class AdminPosOpsController {
  constructor(
    private readonly adminPosOpsService: AdminPosOpsService,
    private readonly config: ConfigService,
  ) {}

  private ensureSuperAdmin(req: FastifyRequest): void {
    if (isSuperAdminRequest(req)) return;

    const token = getAuthTokenFromHeaders(req.headers);
    if (!token) {
      throw new ForbiddenException('Super admin access required');
    }

    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    try {
      const payload = jwt.verify(token, jwtSecret) as { type?: string };
      if (payload.type === 'super_admin') return;
    } catch {
      // fall through
    }

    throw new ForbiddenException('Super admin access required');
  }

  @Get('overview')
  overview(@Req() req: FastifyRequest, @Query('tenantId') tenantId?: string) {
    this.ensureSuperAdmin(req);
    return this.adminPosOpsService.getRetailOverview(tenantId?.trim() || undefined);
  }
}
