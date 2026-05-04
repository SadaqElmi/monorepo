import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PosSessionsService } from './pos-sessions.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OpenPosSessionDto } from './dto/open-pos-session.dto';
import { PatchStatementLineDto } from './dto/patch-statement-line.dto';

@Controller('pos')
export class PosSessionsController {
  constructor(
    private readonly posSessionsService: PosSessionsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Post('sessions/open')
  openSession(@Body() dto: OpenPosSessionDto, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.openSession(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      req.allowedBranchIds ?? [],
      {
        deviceId: dto.deviceId,
        staffUserId: dto.staffUserId,
      },
    );
  }

  @Get('sessions/current')
  getCurrent(@Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getCurrentSession(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('sessions/:sessionId/open-statement')
  openStatement(@Param('sessionId') sessionId: string, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.openStatement(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Get('sessions/:sessionId/x-report')
  xReport(@Param('sessionId') sessionId: string, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getXReport(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Get('sessions/:sessionId/z-report')
  zReport(@Param('sessionId') sessionId: string, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getZReport(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('sessions/:sessionId/close')
  closeSession(@Param('sessionId') sessionId: string, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.closeSession(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Patch('statements/:statementId/lines/:lineId')
  patchLine(
    @Param('statementId') statementId: string,
    @Param('lineId') lineId: string,
    @Body() dto: PatchStatementLineDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.patchStatementLine(
      this.tenantContext.getSchemaName()!,
      statementId,
      lineId,
      req.branchId,
      req.allowedBranchIds ?? [],
      dto.actualAmount,
    );
  }

  @Get('statements/:statementId')
  getStatement(@Param('statementId') statementId: string, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getStatement(
      this.tenantContext.getSchemaName()!,
      statementId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('statements/:statementId/post')
  postStatement(
    @Param('statementId') statementId: string,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.postStatement(
      this.tenantContext.getSchemaName()!,
      statementId,
      req.branchId,
      req.allowedBranchIds ?? [],
      req.userId ?? null,
    );
  }
}
